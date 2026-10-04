import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';

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
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('cash', data);
        if (error) return badRequest(error);

        const snapshot = await prisma.cashSnapshot.create({
            data: {
                user_id: userId,
                ...value,
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
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('cash', data);
        if (error) return badRequest(error);

        const updated = await prisma.cashSnapshot.updateMany({
            where: { id, user_id: userId }, data: value,
        });
        if (!updated.count) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json(await prisma.cashSnapshot.findUnique({ where: { id } }));
    } catch (error) {
        console.error('Error actualizando snapshot:', error);
        if (error.code === 'P2002') return badRequest('Ya existe un saldo para esta cuenta y fecha');
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
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        const deleted = await prisma.cashSnapshot.deleteMany({ where: { id, user_id: userId } });
        if (!deleted.count) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Snapshot eliminado' });
    } catch (error) {
        console.error('Error eliminando snapshot:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
