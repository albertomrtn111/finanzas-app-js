import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { appDate, cents, cleanText, money, todayInMadrid } from '@/lib/business';

const FLOW_TYPES = ['OPERATING', 'INVESTING', 'FINANCING', 'TAX', 'OTHER'];

async function saveAllocations(tx, businessId, movement, raw) {
    if (!Array.isArray(raw) || raw.length > 30) return 'Vínculos de factura inválidos';
    const used = new Set();
    let allocated = 0;
    for (const item of raw) {
        const activityId = validId(item.activity_id);
        const amount = cents(item.amount);
        if (!activityId || !amount || used.has(activityId)) return 'Importe o factura duplicada inválidos';
        used.add(activityId);
        allocated += amount;
        const activity = await tx.businessActivity.findFirst({ where: { id: activityId, business_id: businessId }, include: { allocations: true } });
        if (!activity) return 'Factura no encontrada';
        if ((activity.direction === 'INCOME') !== (Number(movement.amount) > 0)) return 'El signo del movimiento no coincide con el cobro o pago';
        const already = activity.allocations.filter(a => a.movement_id !== movement.id).reduce((sum, a) => sum + cents(a.amount), 0);
        if (already + amount > cents(activity.total_amount)) return 'El importe vinculado supera el pendiente de la factura';
    }
    if (allocated > Math.abs(cents(movement.amount, { allowNegative: true }))) return 'El importe vinculado supera el movimiento';
    await tx.businessAllocation.deleteMany({ where: { movement_id: movement.id, business_id: businessId } });
    for (const item of raw) {
        await tx.businessAllocation.create({ data: { business_id: businessId, movement_id: movement.id, activity_id: Number(item.activity_id), amount: money(cents(item.amount)) } });
    }
    return null;
}

export async function GET(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const accountId = validId(new URL(request.url).searchParams.get('accountId'));
    const movements = await prisma.businessMovement.findMany({
        where: { business_id: context.business.id, ...(accountId ? { account_id: accountId } : {}) },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        include: { account: { select: { name: true } }, allocations: { include: { activity: { select: { description: true, document_number: true } } } } }
    });
    return NextResponse.json(movements);
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const date = appDate(body.date);
    const amount = cents(body.amount);
    const description = cleanText(body.description, 240, true);
    if (!date || !amount || !description || body.date > todayInMadrid()) return NextResponse.json({ error: 'Completa fecha, concepto e importe válido. Para fechas futuras usa Previsión.' }, { status: 400 });

    if (body.flow_type === 'TRANSFER') {
        const fromId = validId(body.from_account_id);
        const toId = validId(body.to_account_id);
        if (!fromId || !toId || fromId === toId) return NextResponse.json({ error: 'Elige dos cuentas distintas' }, { status: 400 });
        const accounts = await prisma.businessAccount.findMany({ where: { id: { in: [fromId, toId] }, business_id: context.business.id } });
        if (accounts.length !== 2 || accounts.some(a => date < a.opening_on)) return NextResponse.json({ error: 'Cuentas o fecha inválidas' }, { status: 400 });
        const group = randomUUID();
        const result = await prisma.$transaction(async tx => {
            const out = await tx.businessMovement.create({ data: { business_id: context.business.id, account_id: fromId, date, amount: money(-amount), description, flow_type: 'TRANSFER', transfer_group: group } });
            const incoming = await tx.businessMovement.create({ data: { business_id: context.business.id, account_id: toId, date, amount: money(amount), description, flow_type: 'TRANSFER', transfer_group: group } });
            return { out, incoming };
        });
        return NextResponse.json(result, { status: 201 });
    }

    const accountId = validId(body.account_id);
    const flowType = body.flow_type || 'OPERATING';
    const sign = body.direction === 'OUT' ? -1 : body.direction === 'IN' ? 1 : 0;
    if (!accountId || !FLOW_TYPES.includes(flowType) || !sign) return NextResponse.json({ error: 'Cuenta, sentido o tipo de flujo inválidos' }, { status: 400 });
    const account = await prisma.businessAccount.findFirst({ where: { id: accountId, business_id: context.business.id } });
    if (!account || date < account.opening_on) return NextResponse.json({ error: 'La cuenta no existe o el movimiento precede a su saldo inicial' }, { status: 400 });
    try {
        const result = await prisma.$transaction(async tx => {
            const movement = await tx.businessMovement.create({ data: { business_id: context.business.id, account_id: accountId, date, amount: money(sign * amount), description, flow_type: flowType } });
            const error = await saveAllocations(tx, context.business.id, movement, body.allocations || []);
            if (error) throw new Error(error);
            return movement;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        if (error.code === 'P2034') return NextResponse.json({ error: 'Otro cambio modificó los pendientes. Vuelve a intentarlo.' }, { status: 409 });
        if (error.message && !error.code) return NextResponse.json({ error: error.message }, { status: 400 });
        throw error;
    }
}

export async function PATCH(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const id = validId(body.id);
    if (!id) return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    try {
        const result = await prisma.$transaction(async tx => {
            const movement = await tx.businessMovement.findFirst({ where: { id, business_id: context.business.id } });
            if (!movement) return { status: 404, error: 'Movimiento no encontrado' };
            if (movement.flow_type === 'TRANSFER') return { status: 409, error: 'Las transferencias no se vinculan a facturas' };
            const error = await saveAllocations(tx, context.business.id, movement, body.allocations);
            return error ? { status: 400, error } : { movement };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return result.error ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result.movement);
    } catch (error) {
        if (error.code === 'P2034') return NextResponse.json({ error: 'Los pendientes han cambiado. Vuelve a intentarlo.' }, { status: 409 });
        throw error;
    }
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    const movement = await prisma.businessMovement.findFirst({ where: { id, business_id: context.business.id } });
    if (!movement) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    await prisma.businessMovement.deleteMany({ where: { business_id: context.business.id, ...(movement.transfer_group ? { transfer_group: movement.transfer_group } : { id }) } });
    return NextResponse.json({ ok: true });
}
