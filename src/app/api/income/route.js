import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import { createLogged, deleteLogged, ensureCategoryLogged, updateLogged, webContext } from '@/lib/changeLog';
import prisma from '@/lib/db';
import { parseFinancialRecord, parseId, parsePagination } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';
import { movementWhere, parseMovementFilters, totalsHeaders } from '@/lib/movementFilters';

// GET - Listar los ingresos del usuario. Filtros opcionales: q, category, from, to, min y max
// (src/lib/movementFilters.js). Devuelve la lista y, en X-Total-Count y X-Total-Amount, cuántos
// ingresos cumplen el filtro y cuánto suman en total.
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

        const where = movementWhere('income', userId, filters);
        const [incomes, totals] = await Promise.all([
            prisma.income.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], ...pagination }),
            prisma.income.aggregate({ where, _count: { _all: true }, _sum: { amount: true } }),
        ]);

        return NextResponse.json(incomes, { headers: totalsHeaders(totals) });
    } catch (error) {
        console.error('Error obteniendo ingresos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear nuevo ingreso
export async function POST(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const data = await request.json().catch(() => null);
        const { value, error } = parseFinancialRecord('income', data);
        if (error) return badRequest(error);

        // El ingreso, su categoría si es nueva y el registro de cambios van en la misma transacción.
        const change = webContext(userId, 'ingresos:crear');
        const income = await prisma.$transaction(async (tx) => {
            await ensureCategoryLogged(tx, change, 'income', value.category);
            return createLogged(tx, change, 'income', { user_id: userId, ...value, created_at: new Date() });
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const data = await request.json().catch(() => null);
        const id = parseId(data?.id);
        if (!id) return badRequest('Identificador inválido');
        const { value, error } = parseFinancialRecord('income', data);
        if (error) return badRequest(error);

        const change = webContext(userId, 'ingresos:editar');
        const income = await prisma.$transaction(async (tx) => {
            const updated = await updateLogged(tx, change, 'income', { id, user_id: userId }, value);
            if (!updated) return null;
            await ensureCategoryLogged(tx, change, 'income', value.category);
            return updated;
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        // Solo si el ingreso es del usuario. Queda en el registro de cambios y se puede recuperar.
        const deleted = await prisma.$transaction(tx => deleteLogged(tx, webContext(userId, 'ingresos:borrar'), 'income', { id, user_id: userId }));
        if (!deleted) {
            return NextResponse.json({ error: 'Ingreso no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Ingreso eliminado' });
    } catch (error) {
        console.error('Error eliminando ingreso:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
