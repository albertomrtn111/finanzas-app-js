import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { badRequest } from '@/lib/apiResponses';

const validType = (type) => type === 'income' || type === 'expense';
const validName = (name) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;

// GET - Obtener categorías
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
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
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { name, type } = await request.json().catch(() => ({}));

        if (!validType(type) || !validName(name)) return badRequest('Categoría inválida');

        let category;
        if (type === 'income') {
            category = await prisma.incomeCategory.create({
                data: {
                    user_id: userId,
                    name: name.trim(),
                    created_at: new Date(),
                },
            });
        } else {
            category = await prisma.expenseCategory.create({
                data: {
                    user_id: userId,
                    name: name.trim(),
                    created_at: new Date(),
                },
            });
        }

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
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { oldName, newName, type } = await request.json().catch(() => ({}));

        if (!validType(type) || !validName(oldName) || !validName(newName)) return badRequest('Categoría inválida');
        const previous = oldName.trim();
        const next = newName.trim();
        const model = type === 'income' ? prisma.incomeCategory : prisma.expenseCategory;
        const existing = await model.findFirst({ where: { user_id: userId, name: previous } });
        if (!existing) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
        if (previous === next) return NextResponse.json({ message: 'Categoría actualizada' });

        if (type === 'income') {
            await prisma.$transaction(async (tx) => {
                await tx.incomeCategory.update({ where: { id: existing.id }, data: { name: next } });
                await tx.income.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
            });
        } else {
            await prisma.$transaction(async (tx) => {
                await tx.expenseCategory.update({ where: { id: existing.id }, data: { name: next } });
                await tx.expense.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
                await tx.budget.updateMany({ where: { user_id: userId, category: previous }, data: { category: next } });
            });
        }

        return NextResponse.json({ message: 'Categoría actualizada' });
    } catch (error) {
        console.error('Error actualizando categoría:', error);
        if (error.code === 'P2002') return badRequest('Esta categoría ya existe');
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar categoría
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
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
            const deleted = await prisma.incomeCategory.deleteMany({
                where: { user_id: userId, name },
            });
            if (!deleted.count) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
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
            const deleted = await prisma.expenseCategory.deleteMany({
                where: { user_id: userId, name },
            });
            if (!deleted.count) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Categoría eliminada' });
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
