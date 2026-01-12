import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Obtener categorías
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'expense';

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
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { name, type } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }

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
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { oldName, newName, type } = await request.json();

        if (!newName?.trim()) {
            return NextResponse.json({ error: 'El nuevo nombre es obligatorio' }, { status: 400 });
        }

        if (type === 'income') {
            // Actualizar categoría
            await prisma.incomeCategory.updateMany({
                where: { user_id: userId, name: oldName },
                data: { name: newName.trim() },
            });
            // Actualizar ingresos con esta categoría
            await prisma.income.updateMany({
                where: { user_id: userId, category: oldName },
                data: { category: newName.trim() },
            });
        } else {
            // Actualizar categoría
            await prisma.expenseCategory.updateMany({
                where: { user_id: userId, name: oldName },
                data: { name: newName.trim() },
            });
            // Actualizar gastos con esta categoría
            await prisma.expense.updateMany({
                where: { user_id: userId, category: oldName },
                data: { category: newName.trim() },
            });
            // Actualizar presupuestos
            await prisma.budget.updateMany({
                where: { user_id: userId, category: oldName },
                data: { category: newName.trim() },
            });
        }

        return NextResponse.json({ message: 'Categoría actualizada' });
    } catch (error) {
        console.error('Error actualizando categoría:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar categoría
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const type = searchParams.get('type') || 'expense';

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
            await prisma.incomeCategory.deleteMany({
                where: { user_id: userId, name },
            });
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
            await prisma.expenseCategory.deleteMany({
                where: { user_id: userId, name },
            });
        }

        return NextResponse.json({ message: 'Categoría eliminada' });
    } catch (error) {
        console.error('Error eliminando categoría:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
