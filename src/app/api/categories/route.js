import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import { createLogged, logChange, webContext } from '@/lib/changeLog';

const ENTITY = { income: 'income_category', expense: 'expense_category' };
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';

const validType = (type) => type === 'income' || type === 'expense';
const validName = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;

// GET - Obtener categorías
export async function GET(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'expense';
        if (!validType(type)) return badRequest('Tipo de categoría inválido');

        let categories;
        if (type === 'income') {
            categories = await prisma.incomeCategory.findMany({
                where: { user_id: userId },
                orderBy: { name: 'asc' },
            });
        } else {
            categories = await prisma.expenseCategory.findMany({
                where: { user_id: userId },
                orderBy: { name: 'asc' },
            });
        }

        return NextResponse.json(categories);
    } catch (error) {
        console.error('Error obteniendo categorías:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear categoría
export async function POST(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { name, type } = await request.json().catch(() => ({}));

        if (!validType(type) || !validName(name)) return badRequest('Categoría inválida');

        const category = await prisma.$transaction(tx => createLogged(tx, webContext(userId, 'categorias:crear'), ENTITY[type], {
            user_id: userId,
            name: name.trim(),
            created_at: new Date(),
        }));

        return NextResponse.json(category);
    } catch (error) {
        console.error('Error creando categoría:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Esta categoría ya existe' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 });
    }
}

// PUT - Actualizar categoría (renombrar)
export async function PUT(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { oldName, newName, type } = await request.json().catch(() => ({}));

        if (!validType(type) || !validName(oldName) || !validName(newName)) return badRequest('Categoría inválida');
        const previous = oldName.trim();
        const next = newName.trim();
        const model = type === 'income' ? prisma.incomeCategory : prisma.expenseCategory;
        const existing = await model.findFirst({ where: { user_id: userId, name: previous } });
        if (!existing) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
        if (previous === next) return NextResponse.json({ message: 'Categoría actualizada' });

        // Igual que el MCP: queda como RENAME y deshacerlo vuelve a renombrar movimientos y presupuestos.
        const change = webContext(userId, 'categorias:renombrar');
        await prisma.$transaction(async (tx) => {
            if (type === 'income') {
                await tx.incomeCategory.update({ where: { id: existing.id }, data: { name: next } });
                await tx.income.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
            } else {
                await tx.expenseCategory.update({ where: { id: existing.id }, data: { name: next } });
                await tx.expense.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
                await tx.budget.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
            }
            await logChange(tx, change, { entity: ENTITY[type], entityId: existing.id, action: 'RENAME', before: { name: previous }, after: { name: next } });
        });

        return NextResponse.json({ message: 'Categoría actualizada' });
    } catch (error) {
        console.error('Error actualizando categoría:', error);
        if (error.code === 'P2002') return badRequest('Esta categoría ya existe');
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// Borra la categoría por nombre y lo registra. Devuelve false si no existe.
function deleteCategoryLogged(userId, type, name) {
    const model = type === 'income' ? 'incomeCategory' : 'expenseCategory';
    return prisma.$transaction(async (tx) => {
        const existing = await tx[model].findFirst({ where: { user_id: userId, name } });
        if (!existing) return false;
        await tx[model].delete({ where: { id: existing.id } });
        await logChange(tx, webContext(userId, 'categorias:borrar'), { entity: ENTITY[type], entityId: existing.id, action: 'DELETE', before: existing });
        return true;
    });
}

// DELETE - Eliminar categoría
export async function DELETE(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const type = searchParams.get('type') || 'expense';
        if (!validType(type) || !validName(name)) return badRequest('Categoría inválida');

        // Verificar si está en uso
        if (type === 'income') {
            const inUse = await prisma.income.count({
                where: { user_id: userId, category: name },
            });
            if (inUse > 0) {
                return NextResponse.json(
                    { error: 'No se puede eliminar: la categoría está en uso' },
                    { status: 400 }
                );
            }
            if (!await deleteCategoryLogged(userId, 'income', name)) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
        } else {
            const inUseExp = await prisma.expense.count({
                where: { user_id: userId, category: name },
            });
            const inUseBud = await prisma.budget.count({
                where: { user_id: userId, category: name },
            });
            if (inUseExp > 0 || inUseBud > 0) {
                return NextResponse.json(
                    { error: 'No se puede eliminar: la categoría está en uso' },
                    { status: 400 }
                );
            }
            if (!await deleteCategoryLogged(userId, 'expense', name)) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Categoría eliminada' });
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
