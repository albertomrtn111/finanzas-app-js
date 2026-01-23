import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Listar todos los gastos del usuario
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);

        // Pagination params
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const expenses = await prisma.expense.findMany({
            where: { user_id: userId },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            take: limit,
            skip: offset,
        });

        // Get total count for pagination info if needed, or just return list
        // For simplicity and speed request, just list is fine, client checks if length < limit to know if more exist.

        return NextResponse.json(expenses);
    } catch (error) {
        console.error('Error obteniendo gastos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear nuevo gasto
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const expense = await prisma.expense.create({
            data: {
                user_id: userId,
                date: new Date(data.date),
                amount: parseFloat(data.amount),
                category: data.category,
                subcategory: data.subcategory || null,
                payment_method: data.payment_method || null,
                expense_type: data.expense_type || null,
                notes: data.notes || null,
                created_at: new Date(),
            },
        });

        return NextResponse.json(expense);
    } catch (error) {
        console.error('Error creando gasto:', error);
        return NextResponse.json({ error: 'Error al crear gasto' }, { status: 500 });
    }
}

// PUT - Actualizar gasto
export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const expense = await prisma.expense.update({
            where: {
                id: parseInt(data.id),
            },
            data: {
                date: new Date(data.date),
                amount: parseFloat(data.amount),
                category: data.category,
                subcategory: data.subcategory || null,
                payment_method: data.payment_method || null,
                expense_type: data.expense_type || null,
                notes: data.notes || null,
            },
        });

        // Verificar que pertenece al usuario
        if (expense.user_id !== userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        return NextResponse.json(expense);
    } catch (error) {
        console.error('Error actualizando gasto:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar gasto
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseInt(searchParams.get('id'));

        // Verificar que el gasto pertenece al usuario
        const expense = await prisma.expense.findFirst({
            where: { id, user_id: userId },
        });

        if (!expense) {
            return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
        }

        await prisma.expense.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'Gasto eliminado' });
    } catch (error) {
        console.error('Error eliminando gasto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
