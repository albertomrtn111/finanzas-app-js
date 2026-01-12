import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Listar snapshots de efectivo
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const snapshots = await prisma.cashSnapshot.findMany({
            where: { user_id: userId },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
        });

        return NextResponse.json(snapshots);
    } catch (error) {
        console.error('Error obteniendo cash:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear snapshot
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const snapshot = await prisma.cashSnapshot.create({
            data: {
                user_id: userId,
                date: new Date(data.date),
                account: data.account,
                current_value: parseFloat(data.current_value),
                notes: data.notes || null,
                created_at: new Date(),
            },
        });

        return NextResponse.json(snapshot);
    } catch (error) {
        console.error('Error creando snapshot:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Ya existe un snapshot para esta cuenta y fecha' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error al crear' }, { status: 500 });
    }
}

// PUT - Actualizar snapshot
export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json();

        const existing = await prisma.cashSnapshot.findFirst({
            where: { id: parseInt(data.id), user_id: userId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        const snapshot = await prisma.cashSnapshot.update({
            where: { id: parseInt(data.id) },
            data: {
                date: new Date(data.date),
                account: data.account,
                current_value: parseFloat(data.current_value),
                notes: data.notes || null,
            },
        });

        return NextResponse.json(snapshot);
    } catch (error) {
        console.error('Error actualizando snapshot:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar snapshot
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseInt(searchParams.get('id'));

        const snapshot = await prisma.cashSnapshot.findFirst({
            where: { id, user_id: userId },
        });

        if (!snapshot) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        await prisma.cashSnapshot.delete({ where: { id } });

        return NextResponse.json({ message: 'Snapshot eliminado' });
    } catch (error) {
        console.error('Error eliminando snapshot:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
