import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, businessRoute, jsonBody, validId } from '@/lib/businessAccess';
import { appDate, cents, cleanText, money } from '@/lib/business';
import { createLogged, deleteLogged, updateLogged, webContext } from '@/lib/changeLog';

export const GET = businessRoute(async (_request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    return NextResponse.json(await prisma.businessCashPlan.findMany({ where: { business_id: context.business.id }, orderBy: { due_on: 'asc' } }));
});

export const POST = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const description = cleanText(body.description, 240, true);
    const category = cleanText(body.category, 100, true);
    const due_on = appDate(body.due_on);
    const amount = cents(body.amount);
    if (!description || !category || !due_on || !amount || !['INCOME', 'EXPENSE'].includes(body.direction)) return NextResponse.json({ error: 'Previsión inválida: completa concepto, categoría, fecha e importe mayor que 0 con hasta dos decimales' }, { status: 400 });
    const change = webContext(context.userId, 'empresa:previsiones:crear');
    const plan = await prisma.$transaction(tx => createLogged(tx, change, 'business_cash_plan', { business_id: context.business.id, description, category, due_on, amount: money(amount), direction: body.direction }, { businessId: context.business.id }));
    return NextResponse.json(plan, { status: 201 });
});

export const DELETE = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Previsión inválida' }, { status: 400 });
    const change = webContext(context.userId, 'empresa:previsiones:borrar');
    const deleted = await prisma.$transaction(tx => deleteLogged(tx, change, 'business_cash_plan', { id, business_id: context.business.id }, { businessId: context.business.id }));
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Previsión no encontrada' }, { status: 404 });
});

export const PATCH = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const id = validId(body.id);
    if (!id || !['PLANNED', 'DONE'].includes(body.status)) return NextResponse.json({ error: 'Previsión inválida' }, { status: 400 });
    const change = webContext(context.userId, 'empresa:previsiones:marcar');
    const updated = await prisma.$transaction(tx => updateLogged(tx, change, 'business_cash_plan', { id, business_id: context.business.id }, { status: body.status }, { businessId: context.business.id }));
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Previsión no encontrada' }, { status: 404 });
});
