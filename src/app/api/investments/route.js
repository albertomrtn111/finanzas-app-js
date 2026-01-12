import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Listar inversiones
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const investments = await prisma.investment.findMany({
            where: { user_id: userId },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
        });

        return NextResponse.json(investments);
    } catch (error) {
        console.error('Error obteniendo inversiones:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear inversión
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const investment = await prisma.investment.create({
            data: {
                user_id: userId,
                date: new Date(data.date),
                account: data.account,
                asset_type: data.asset_type,
                contribution: parseFloat(data.contribution),
                current_value: parseFloat(data.current_value),
                notes: data.notes || null,
                created_at: new Date(),
            },
        });

        return NextResponse.json(investment);
    } catch (error) {
        console.error('Error creando inversión:', error);
        return NextResponse.json({ error: 'Error al crear' }, { status: 500 });
    }
}

// PUT - Actualizar inversión
export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        // Verificar propiedad
        const existing = await prisma.investment.findFirst({
            where: { id: parseInt(data.id), user_id: userId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        const investment = await prisma.investment.update({
            where: { id: parseInt(data.id) },
            data: {
                date: new Date(data.date),
                account: data.account,
                asset_type: data.asset_type,
                contribution: parseFloat(data.contribution),
                current_value: parseFloat(data.current_value),
                notes: data.notes || null,
            },
        });

        return NextResponse.json(investment);
    } catch (error) {
        console.error('Error actualizando inversión:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar inversión
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseInt(searchParams.get('id'));

        const investment = await prisma.investment.findFirst({
            where: { id, user_id: userId },
        });

        if (!investment) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        await prisma.investment.delete({ where: { id } });

        return NextResponse.json({ message: 'Inversión eliminada' });
    } catch (error) {
        console.error('Error eliminando inversión:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
