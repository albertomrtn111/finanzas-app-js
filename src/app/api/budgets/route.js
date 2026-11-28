import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import { logChange, newBatchId, planBudgetReplacement, webContext } from '@/lib/changeLog';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';

// GET - Obtener presupuestos
export async function GET(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;

        const budgets = await prisma.budget.findMany({
            where: { user_id: userId },
            orderBy: { category: 'asc' },
        });

        return NextResponse.json(budgets);
    } catch (error) {
        console.error('Error obteniendo presupuestos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Guardar todos los presupuestos (upsert masivo)
export async function POST(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { budgets } = await request.json().catch(() => ({}));
        if (!Array.isArray(budgets) || budgets.length > 500) return badRequest('Lista de presupuestos inválida');
        const names = new Set();
        const parsed = [];
        for (const budget of budgets) {
            if (!budget || typeof budget.category !== 'string' || !budget.category.trim() ||
                budget.category.trim().length > 100) return badRequest('Categoría de presupuesto inválida');
            const category = budget.category.trim();
            if (names.has(category)) return badRequest('Hay categorías duplicadas');
            names.add(category);
            const amount = budget.monthly_amount;
            if ((typeof amount !== 'number' && typeof amount !== 'string') ||
                !/^\d+(?:\.\d{1,2})?$/.test(String(amount)) ||
                !Number.isFinite(Number(amount)) || Number(amount) > 9999999999.99) {
                return badRequest(`Importe inválido para ${category}`);
            }
            parsed.push({ category, monthly_amount: String(amount) });
        }

        // La lista enviada sustituye a la guardada. Solo se tocan los presupuestos que cambian, y todos
        // quedan en un mismo lote del registro de cambios para poder deshacer el guardado entero.
        const change = { ...webContext(userId, 'presupuestos:guardar'), batchId: newBatchId() };
        await prisma.$transaction(async (tx) => {
            const existing = await tx.budget.findMany({ where: { user_id: userId }, orderBy: { id: 'asc' } });
            const { removed, changed, added } = planBudgetReplacement(existing, parsed);
            for (const budget of removed) {
                await tx.budget.delete({ where: { id: budget.id } });
                await logChange(tx, change, { entity: 'budget', entityId: budget.id, action: 'DELETE', before: budget });
            }
            for (const { before, monthly_amount } of changed) {
                const updated = await tx.budget.update({ where: { id: before.id }, data: { monthly_amount, updated_at: new Date() } });
                await logChange(tx, change, { entity: 'budget', entityId: before.id, action: 'UPDATE', before, after: updated });
            }
            for (const { category, monthly_amount } of added) {
                const created = await tx.budget.create({ data: { user_id: userId, category, monthly_amount, created_at: new Date(), updated_at: new Date() } });
                await logChange(tx, change, { entity: 'budget', entityId: created.id, action: 'CREATE', after: created });
            }
        });

        return NextResponse.json({ message: 'Presupuestos guardados', count: parsed.length });
    } catch (error) {
        console.error('Error guardando presupuestos:', error);
        return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    }
}
