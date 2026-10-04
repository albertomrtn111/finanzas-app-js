import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';

// GET - Obtener presupuestos
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

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
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
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
            parsed.push({ user_id: userId, category, monthly_amount: String(amount),
                created_at: new Date(), updated_at: new Date() });
        }

        const newBudgets = await prisma.$transaction(async (tx) => {
            await tx.budget.deleteMany({ where: { user_id: userId } });
            return tx.budget.createMany({ data: parsed });
        });

        return NextResponse.json({ message: 'Presupuestos guardados', count: newBudgets.count });
    } catch (error) {
        console.error('Error guardando presupuestos:', error);
        return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    }
}
