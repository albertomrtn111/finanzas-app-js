import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, businessRoute, jsonBody, validId } from '@/lib/businessAccess';
import { createBusinessMovement, replaceAllocations } from '@/lib/businessMovements';
import { deleteMovementLogged, logChange, logCreatedMovements, webContext } from '@/lib/changeLog';

export const GET = businessRoute(async (request, { params }) => {
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
});

export const POST = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    // El movimiento (o los dos de un traspaso), sus vínculos y el registro de cambios van en la misma transacción.
    const change = webContext(context.userId, 'empresa:movimientos:crear');
    const result = await createBusinessMovement(context.business.id, await jsonBody(request), {
        onCreated: (tx, created) => logCreatedMovements(tx, change, context.business.id, created),
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    const [first, second] = result.movements;
    return NextResponse.json(result.transfer ? { out: first, incoming: second } : first, { status: 201 });
});

export const PATCH = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const id = validId(body.id);
    if (!id) return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    // Vincular o desvincular facturas: se guardan los vínculos anteriores para poder restaurarlos.
    const change = webContext(context.userId, 'empresa:movimientos:vincular');
    const result = await replaceAllocations(context.business.id, id, body.allocations, {
        onReplaced: (tx, { before, after }) => logChange(tx, change, { entity: 'business_movement_links', entityId: id, action: 'UPDATE', before, after, businessId: context.business.id }),
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    const { allocations: _previous, ...movement } = result.movement;
    return NextResponse.json(movement);
});

export const DELETE = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    // Sus vínculos con facturas se borran en cascada y esas facturas vuelven a quedar pendientes.
    // En un traspaso se borran los dos movimientos, en un mismo lote del registro de cambios.
    const found = await prisma.$transaction(async tx => {
        const movement = await tx.businessMovement.findFirst({ where: { id, business_id: context.business.id } });
        if (!movement) return false;
        await deleteMovementLogged(tx, webContext(context.userId, 'empresa:movimientos:borrar'), context.business.id, movement);
        return true;
    });
    if (!found) return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true });
});
