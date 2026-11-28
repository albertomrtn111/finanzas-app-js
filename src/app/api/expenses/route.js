import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import { createLogged, deleteLogged, ensureCategoryLogged, webContext } from '@/lib/changeLog';
import { updatePersonalAndLearn } from '@/lib/classificationRuleStore';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId, parsePagination } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';
import { movementWhere, parseMovementFilters, totalsHeaders } from '@/lib/movementFilters';

// GET - Listar los gastos del usuario. Filtros opcionales: q, category, from, to, min y max
// (src/lib/movementFilters.js). Devuelve la lista y, en X-Total-Count y X-Total-Amount, cuántos
// gastos cumplen el filtro y cuánto suman en total.
export async function GET(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('expense', data);
        if (error) return badRequest(error);

        // El gasto, su categoría si es nueva y el registro de cambios van en la misma transacción.
        const change = webContext(userId, 'gastos:crear');
        const expense = await prisma.$transaction(async (tx) => {
            await ensureCategoryLogged(tx, change, 'expense', value.category);
            return createLogged(tx, change, 'expense', { user_id: userId, ...value, created_at: new Date() });
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('expense', data);
        if (error) return badRequest(error);

        // Si cambia la clasificación, se aprende la regla del comercio (en el mismo lote que la edición).
        const change = webContext(userId, 'gastos:editar');
        const expense = await prisma.$transaction(async (tx) => {
            const result = await updatePersonalAndLearn(tx, change, 'expense', { id, user_id: userId }, value);
            if (!result) return null;
            await ensureCategoryLogged(tx, result.ctx, 'expense', value.category);
            return result.record;
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        // Solo si el gasto es del usuario. Queda en el registro de cambios y se puede recuperar.
        const deleted = await prisma.$transaction(tx => deleteLogged(tx, webContext(userId, 'gastos:borrar'), 'expense', { id, user_id: userId }));
        if (!deleted) {
            return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Gasto eliminado' });
    } catch (error) {
        console.error('Error eliminando gasto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
