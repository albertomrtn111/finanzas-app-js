import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { createBusinessMovement, replaceAllocations } from '@/lib/businessMovements';

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
    const result = await createBusinessMovement(context.business.id, body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    const [first, second] = result.movements;
    return NextResponse.json(result.transfer ? { out: first, incoming: second } : first, { status: 201 });
}

export async function PATCH(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const id = validId(body.id);
    if (!id) return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    const result = await replaceAllocations(context.business.id, id, body.allocations);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    const { allocations: _previous, ...movement } = result.movement;
    return NextResponse.json(movement);
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
