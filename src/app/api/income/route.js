import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Listar todos los ingresos del usuario
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

        const incomes = await prisma.income.findMany({
            where: { user_id: userId },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            take: limit,
            skip: offset,
        });

        return NextResponse.json(incomes);
    } catch (error) {
        console.error('Error obteniendo ingresos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear nuevo ingreso
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const income = await prisma.income.create({
            data: {
                user_id: userId,
                date: new Date(data.date),
                amount: parseFloat(data.amount),
                source: data.source || null,
                category: data.category,
                notes: data.notes || null,
                created_at: new Date(),
            },
        });

        return NextResponse.json(income);
    } catch (error) {
        console.error('Error creando ingreso:', error);
        return NextResponse.json({ error: 'Error al crear ingreso' }, { status: 500 });
    }
}

// PUT - Actualizar ingreso
export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const income = await prisma.income.update({
            where: { id: parseInt(data.id) },
            data: {
                date: new Date(data.date),
                amount: parseFloat(data.amount),
                source: data.source || null,
                category: data.category,
                notes: data.notes || null,
            },
        });

        if (income.user_id !== userId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        return NextResponse.json(income);
    } catch (error) {
        console.error('Error actualizando ingreso:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar ingreso
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseInt(searchParams.get('id'));

        const income = await prisma.income.findFirst({
            where: { id, user_id: userId },
        });

        if (!income) {
            return NextResponse.json({ error: 'Ingreso no encontrado' }, { status: 404 });
        }

        await prisma.income.delete({ where: { id } });

        return NextResponse.json({ message: 'Ingreso eliminado' });
    } catch (error) {
        console.error('Error eliminando ingreso:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
