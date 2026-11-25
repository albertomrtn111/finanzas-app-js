import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { businessContext, businessRoute, jsonBody, validId } from '@/lib/businessAccess';
import { activityInput, cents, closedQuarterMessage, closedQuartersTouched } from '@/lib/business';

// Cambiar o borrar una factura de un trimestre de IVA ya terminado hay que pedirlo de forma expresa
// con ?trimestre=cerrado, igual que borrar sus documentos con ?adjuntos=borrar.
function closedQuarterRefusal(periods, action) {
    return { status: 409, error: `${closedQuarterMessage(periods, action)} Para hacerlo igualmente, confírmalo (?trimestre=cerrado).`, trimestre_cerrado: periods };
}

function respond(result, success) {
    if (!result.error) return success(result);
    const { status, ...payload } = result;
    return NextResponse.json(payload, { status });
}

export const GET = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const direction = new URL(request.url).searchParams.get('direction');
    if (direction && !['INCOME', 'EXPENSE'].includes(direction)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    const activities = await prisma.businessActivity.findMany({
        where: { business_id: context.business.id, ...(direction ? { direction } : {}) },
        orderBy: [{ occurred_on: 'desc' }, { id: 'desc' }],
        include: { allocations: { select: { id: true, amount: true, movement_id: true } }, attachments: { select: { id: true, filename: true, mime_type: true } } }
    });
    return NextResponse.json(activities);
});

export const POST = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const { value, error } = activityInput(await jsonBody(request));
    if (error) return NextResponse.json({ error }, { status: 400 });
    try {
        const activity = await prisma.businessActivity.create({ data: { business_id: context.business.id, ...value } });
        return NextResponse.json(activity, { status: 201 });
    } catch (cause) {
        if (cause.code === 'P2002') return NextResponse.json({ error: 'Ya existe una factura con ese número en este tipo de registro' }, { status: 409 });
        throw cause;
    }
});

export const PATCH = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const id = validId(body.id);
    if (!id) return NextResponse.json({ error: 'Operación inválida' }, { status: 400 });
    const { value, error } = activityInput(body);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const confirmedClosedQuarter = new URL(request.url).searchParams.get('trimestre') === 'cerrado';
    try {
        const result = await prisma.$transaction(async tx => {
            const existing = await tx.businessActivity.findFirst({ where: { id, business_id: context.business.id }, include: { allocations: true } });
            if (!existing) return { status: 404, error: 'Operación no encontrada' };
            const closed = closedQuartersTouched(existing, value);
            if (closed.length && !confirmedClosedQuarter) return closedQuarterRefusal(closed, 'editar');
            if (existing.allocations.length && existing.direction !== value.direction) return { status: 409, error: 'Desvincula los cobros o pagos antes de cambiar el tipo' };
            const paid = existing.allocations.reduce((sum, a) => sum + cents(a.amount), 0);
            if (paid > cents(value.total_amount)) return { status: 409, error: 'El nuevo total es inferior al importe ya cobrado o pagado' };
            await tx.businessActivity.update({ where: { id }, data: value });
            return { activity: await tx.businessActivity.findUnique({ where: { id } }) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return respond(result, ({ activity }) => NextResponse.json(activity));
    } catch (cause) {
        if (cause.code === 'P2002') return NextResponse.json({ error: 'Ya existe una factura con ese número' }, { status: 409 });
        if (cause.code === 'P2034') return NextResponse.json({ error: 'Los cobros o pagos han cambiado. Vuelve a intentarlo.' }, { status: 409 });
        throw cause;
    }
});

export const DELETE = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const search = new URL(request.url).searchParams;
    const id = validId(search.get('id'));
    if (!id) return NextResponse.json({ error: 'Operación inválida' }, { status: 400 });
    try {
        // Comprobar y borrar en la misma transacción; además, la base de datos impide borrar una
        // operación con cobros o pagos vinculados (clave ajena NO ACTION).
        const result = await prisma.$transaction(async tx => {
            const existing = await tx.businessActivity.findFirst({ where: { id, business_id: context.business.id }, include: { _count: { select: { allocations: true, attachments: true } } } });
            if (!existing) return { status: 404, error: 'Operación no encontrada' };
            if (existing._count.allocations) return { status: 409, error: 'Desvincula sus cobros o pagos antes de eliminarla' };
            const closed = closedQuartersTouched(existing);
            if (closed.length && search.get('trimestre') !== 'cerrado') return closedQuarterRefusal(closed, 'borrar');
            // Borrar la operación borra sus documentos: hay que pedirlo de forma expresa.
            const files = existing._count.attachments;
            if (files && search.get('adjuntos') !== 'borrar') {
                return { status: 409, error: `Esta operación tiene ${files === 1 ? 'un documento adjunto' : `${files} documentos adjuntos`} que también se borrarían. Descárgalos antes si quieres conservarlos.`, adjuntos: files };
            }
            await tx.businessActivity.delete({ where: { id } });
            return { ok: true };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return respond(result, () => NextResponse.json({ ok: true }));
    } catch (cause) {
        if (cause.code === 'P2003') return NextResponse.json({ error: 'Desvincula sus cobros o pagos antes de eliminarla' }, { status: 409 });
        if (cause.code === 'P2034') return NextResponse.json({ error: 'La operación ha cambiado mientras se borraba. Vuelve a intentarlo.' }, { status: 409 });
        throw cause;
    }
});
