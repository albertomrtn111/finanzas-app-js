import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { appDate, cents, cleanText, money, todayInMadrid } from '@/lib/business';

export async function GET(_request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const accounts = await prisma.businessAccount.findMany({ where: { business_id: context.business.id }, orderBy: { id: 'asc' }, include: { movements: { where: { date: { lte: appDate(todayInMadrid()) } }, select: { amount: true } } } });
    return NextResponse.json(accounts.map(({ movements, ...account }) => ({
        ...account,
        balance: money((cents(account.opening_balance, { allowNegative: true, allowZero: true }) || 0) + movements.reduce((sum, m) => sum + cents(m.amount, { allowNegative: true, allowZero: true }), 0)),
        movement_count: movements.length
    })));
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body.name, 120, true);
    const kind = body.kind || 'BANK';
    const opening_on = appDate(body.opening_on);
    const balance = cents(body.opening_balance, { allowNegative: true, allowZero: true });
    if (!name || !['BANK', 'CASH'].includes(kind) || !opening_on || body.opening_on > todayInMadrid() || balance === null) return NextResponse.json({ error: 'Datos de cuenta inválidos. La fecha inicial no puede ser futura.' }, { status: 400 });
    try {
        const account = await prisma.businessAccount.create({ data: { business_id: context.business.id, name, kind, opening_on, opening_balance: money(balance) } });
        return NextResponse.json(account, { status: 201 });
    } catch (error) {
        if (error.code === 'P2002') return NextResponse.json({ error: 'Ya existe una cuenta con ese nombre' }, { status: 409 });
        throw error;
    }
}

export async function PATCH(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const id = validId(body.id);
    const name = cleanText(body.name, 120, true);
    const kind = body.kind;
    const opening_on = appDate(body.opening_on);
    const balance = cents(body.opening_balance, { allowNegative: true, allowZero: true });
    if (!id || !name || !['BANK', 'CASH'].includes(kind) || !opening_on || body.opening_on > todayInMadrid() || balance === null) return NextResponse.json({ error: 'Cuenta inválida' }, { status: 400 });
    const existing = await prisma.businessAccount.findFirst({ where: { id, business_id: context.business.id } });
    if (!existing) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    const count = await prisma.businessMovement.count({ where: { account_id: id, business_id: context.business.id } });
    if (count && (existing.kind !== kind || existing.opening_on.getTime() !== opening_on.getTime() || Number(existing.opening_balance) !== balance / 100)) return NextResponse.json({ error: 'Con movimientos, solo puedes cambiar el nombre. Registra un ajuste de saldo si es necesario.' }, { status: 409 });
    try {
        const updated = await prisma.businessAccount.updateMany({ where: { id, business_id: context.business.id }, data: { name, kind, opening_on, opening_balance: money(balance) } });
        if (!updated.count) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
        return NextResponse.json(await prisma.businessAccount.findUnique({ where: { id } }));
    } catch (error) {
        if (error.code === 'P2002') return NextResponse.json({ error: 'Ya existe una cuenta con ese nombre' }, { status: 409 });
        throw error;
    }
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Cuenta inválida' }, { status: 400 });
    const count = await prisma.businessMovement.count({ where: { account_id: id, business_id: context.business.id } });
    if (count) return NextResponse.json({ error: 'La cuenta tiene movimientos. Consérvala para mantener el historial.' }, { status: 409 });
    const deleted = await prisma.businessAccount.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
}
