import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { cents, cleanText, money } from '@/lib/business';

export async function GET(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const period = new URL(request.url).searchParams.get('period');
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 });
    return NextResponse.json(await prisma.businessBudget.findMany({ where: { business_id: context.business.id, ...(period ? { period } : {}) }, orderBy: [{ period: 'desc' }, { direction: 'asc' }, { category: 'asc' }] }));
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const period = body.period;
    const category = cleanText(body.category, 100, true);
    const amount = cents(body.amount);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '') || !category || !['INCOME', 'EXPENSE'].includes(body.direction) || !amount) return NextResponse.json({ error: 'Presupuesto inválido' }, { status: 400 });
    const budget = await prisma.businessBudget.upsert({
        where: { business_id_period_direction_category: { business_id: context.business.id, period, direction: body.direction, category } },
        update: { amount: money(amount) },
        create: { business_id: context.business.id, period, direction: body.direction, category, amount: money(amount) }
    });
    return NextResponse.json(budget);
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Presupuesto inválido' }, { status: 400 });
    const deleted = await prisma.businessBudget.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
}
