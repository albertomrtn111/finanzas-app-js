import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId, parsePagination } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';

// GET - Listar todos los ingresos del usuario
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);

        // Pagination params
        const { value: pagination, error: paginationError } = parsePagination(searchParams);
        if (paginationError) return badRequest(paginationError);

        const incomes = await prisma.income.findMany({
            where: { user_id: userId },
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            ...pagination,
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('income', data);
        if (error) return badRequest(error);

        const income = await prisma.$transaction(async (tx) => {
            await tx.incomeCategory.upsert({
                where: { user_id_name: { user_id: userId, name: value.category } },
                create: { user_id: userId, name: value.category, created_at: new Date() },
                update: {},
            });
            return tx.income.create({ data: { user_id: userId, ...value, created_at: new Date() } });
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('income', data);
        if (error) return badRequest(error);

        const income = await prisma.$transaction(async (tx) => {
            const updated = await tx.income.updateMany({ where: { id, user_id: userId }, data: value });
            if (!updated.count) return null;
            await tx.incomeCategory.upsert({
                where: { user_id_name: { user_id: userId, name: value.category } },
                create: { user_id: userId, name: value.category, created_at: new Date() },
                update: {},
            });
            return tx.income.findUnique({ where: { id } });
        });

        if (!income) {
            return NextResponse.json({ error: 'Ingreso no encontrado' }, { status: 404 });
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        const deleted = await prisma.income.deleteMany({ where: { id, user_id: userId } });
        if (!deleted.count) {
            return NextResponse.json({ error: 'Ingreso no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Ingreso eliminado' });
    } catch (error) {
        console.error('Error eliminando ingreso:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
