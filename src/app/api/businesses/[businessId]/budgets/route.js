import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, businessRoute, jsonBody, validId } from '@/lib/businessAccess';
import { cents, cleanText, money } from '@/lib/business';
import { deleteLogged, logChange, webContext } from '@/lib/changeLog';

export const GET = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const period = new URL(request.url).searchParams.get('period');
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 });
    return NextResponse.json(await prisma.businessBudget.findMany({ where: { business_id: context.business.id, ...(period ? { period } : {}) }, orderBy: [{ period: 'desc' }, { direction: 'asc' }, { category: 'asc' }] }));
});

export const POST = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const period = body.period;
    const category = cleanText(body.category, 100, true);
    const amount = cents(body.amount);
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !category || !['INCOME', 'EXPENSE'].includes(body.direction) || !amount) return NextResponse.json({ error: 'Presupuesto inválido: indica mes, tipo, categoría e importe mayor que 0 con hasta dos decimales' }, { status: 400 });
    const key = { business_id_period_direction_category: { business_id: context.business.id, period, direction: body.direction, category } };
    const change = webContext(context.userId, 'empresa:presupuestos:guardar');
    const budget = await prisma.$transaction(async tx => {
        const existing = await tx.businessBudget.findUnique({ where: key });
        const saved = await tx.businessBudget.upsert({
            where: key,
            update: { amount: money(amount) },
            create: { business_id: context.business.id, period, direction: body.direction, category, amount: money(amount) }
        });
        // Un importe igual al guardado no cambia nada: no se registra.
        if (!existing || cents(existing.amount) !== amount) {
            await logChange(tx, change, existing
                ? { entity: 'business_budget', entityId: saved.id, action: 'UPDATE', before: existing, after: saved, businessId: context.business.id }
                : { entity: 'business_budget', entityId: saved.id, action: 'CREATE', after: saved, businessId: context.business.id });
        }
        return saved;
    });
    return NextResponse.json(budget);
});

export const DELETE = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Presupuesto inválido' }, { status: 400 });
    const change = webContext(context.userId, 'empresa:presupuestos:borrar');
    const deleted = await prisma.$transaction(tx => deleteLogged(tx, change, 'business_budget', { id, business_id: context.business.id }, { businessId: context.business.id }));
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
});
