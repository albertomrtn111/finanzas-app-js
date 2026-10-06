import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { appDate, cents, cleanText, money } from '@/lib/business';

export async function GET(_request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    return NextResponse.json(await prisma.businessCashPlan.findMany({ where: { business_id: context.business.id }, orderBy: { due_on: 'asc' } }));
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const description = cleanText(body.description, 240, true);
    const category = cleanText(body.category, 100, true);
    const due_on = appDate(body.due_on);
    const amount = cents(body.amount);
    if (!description || !category || !due_on || !amount || !['INCOME', 'EXPENSE'].includes(body.direction)) return NextResponse.json({ error: 'Previsión inválida' }, { status: 400 });
    const plan = await prisma.businessCashPlan.create({ data: { business_id: context.business.id, description, category, due_on, amount: money(amount), direction: body.direction } });
    return NextResponse.json(plan, { status: 201 });
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Previsión inválida' }, { status: 400 });
    const deleted = await prisma.businessCashPlan.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Previsión no encontrada' }, { status: 404 });
}

export async function PATCH(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const id = validId(body.id);
    if (!id || !['PLANNED', 'DONE'].includes(body.status)) return NextResponse.json({ error: 'Previsión inválida' }, { status: 400 });
    const updated = await prisma.businessCashPlan.updateMany({ where: { id, business_id: context.business.id }, data: { status: body.status } });
    return updated.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Previsión no encontrada' }, { status: 404 });
}
