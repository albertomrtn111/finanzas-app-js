import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId, parsePagination } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';
import { movementWhere, parseMovementFilters, totalsHeaders } from '@/lib/movementFilters';

// GET - Listar los gastos del usuario. Filtros opcionales: q, category, from, to, min y max
// (src/lib/movementFilters.js). Devuelve la lista y, en X-Total-Count y X-Total-Amount, cuántos
// gastos cumplen el filtro y cuánto suman en total.
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
        const { value: filters, error: filterError } = parseMovementFilters(searchParams);
        if (filterError) return badRequest(filterError);

        const where = movementWhere('expense', userId, filters);
        const [expenses, totals] = await Promise.all([
            prisma.expense.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], ...pagination }),
            prisma.expense.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
        ]);

        return NextResponse.json(expenses, { headers: totalsHeaders(totals) });
    } catch (error) {
        console.error('Error obteniendo gastos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear nuevo gasto
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('expense', data);
        if (error) return badRequest(error);

        const expense = await prisma.$transaction(async (tx) => {
            await tx.expenseCategory.upsert({
                where: { user_id_name: { user_id: userId, name: value.category } },
                create: { user_id: userId, name: value.category, created_at: new Date() },
                update: {},
            });
            return tx.expense.create({ data: { user_id: userId, ...value, created_at: new Date() } });
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('expense', data);
        if (error) return badRequest(error);

        const expense = await prisma.$transaction(async (tx) => {
            const updated = await tx.expense.updateMany({ where: { id, user_id: userId }, data: value });
            if (!updated.count) return null;
            await tx.expenseCategory.upsert({
                where: { user_id_name: { user_id: userId, name: value.category } },
                create: { user_id: userId, name: value.category, created_at: new Date() },
                update: {},
            });
            return tx.expense.findUnique({ where: { id } });
        });

        if (!expense) {
            return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
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
        if (!session?.user?.id || ['COMPANY', 'UNSET'].includes(session.user.accountMode)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        // Verificar que el gasto pertenece al usuario
        const deleted = await prisma.expense.deleteMany({ where: { id, user_id: userId } });
        if (!deleted.count) {
            return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Gasto eliminado' });
    } catch (error) {
        console.error('Error eliminando gasto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
