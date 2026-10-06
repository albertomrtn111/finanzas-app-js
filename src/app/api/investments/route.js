import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';

// GET - Listar inversiones
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('investment', data);
        if (error) return badRequest(error);

        const investment = await prisma.investment.create({
            data: {
                user_id: userId,
                ...value,
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('investment', data);
        if (error) return badRequest(error);

        const updated = await prisma.investment.updateMany({
            where: { id, user_id: userId }, data: value,
        });
        if (!updated.count) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json(await prisma.investment.findUnique({ where: { id } }));
    } catch (error) {
        console.error('Error actualizando inversión:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar inversión
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        const deleted = await prisma.investment.deleteMany({ where: { id, user_id: userId } });
        if (!deleted.count) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Inversión eliminada' });
    } catch (error) {
        console.error('Error eliminando inversión:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
