import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';
import { activityInput, cents } from '@/lib/business';

export async function GET(request, { params }) {
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
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const { value, error } = activityInput(body);
    if (error) return NextResponse.json({ error }, { status: 400 });
    try {
        const activity = await prisma.businessActivity.create({ data: { business_id: context.business.id, ...value } });
        return NextResponse.json(activity, { status: 201 });
    } catch (cause) {
        if (cause.code === 'P2002') return NextResponse.json({ error: 'Ya existe una factura con ese número en este tipo de registro' }, { status: 409 });
        throw cause;
    }
}

export async function PATCH(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await request.json().catch(() => ({}));
    const id = validId(body.id);
    if (!id) return NextResponse.json({ error: 'Operación inválida' }, { status: 400 });
    const { value, error } = activityInput(body);
    if (error) return NextResponse.json({ error }, { status: 400 });
    try {
        const result = await prisma.$transaction(async tx => {
            const existing = await tx.businessActivity.findFirst({ where: { id, business_id: context.business.id }, include: { allocations: true } });
            if (!existing) return { status: 404, error: 'Operación no encontrada' };
            if (existing.allocations.length && existing.direction !== value.direction) return { status: 409, error: 'Desvincula los cobros o pagos antes de cambiar el tipo' };
            const paid = existing.allocations.reduce((sum, a) => sum + cents(a.amount), 0);
            if (paid > cents(value.total_amount)) return { status: 409, error: 'El nuevo total es inferior al importe ya cobrado o pagado' };
            await tx.businessActivity.update({ where: { id }, data: value });
            return { activity: await tx.businessActivity.findUnique({ where: { id } }) };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return result.error ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result.activity);
    } catch (cause) {
        if (cause.code === 'P2002') return NextResponse.json({ error: 'Ya existe una factura con ese número' }, { status: 409 });
        if (cause.code === 'P2034') return NextResponse.json({ error: 'Los cobros o pagos han cambiado. Vuelve a intentarlo.' }, { status: 409 });
        throw cause;
    }
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Operación inválida' }, { status: 400 });
    const linked = await prisma.businessAllocation.count({ where: { business_id: context.business.id, activity_id: id } });
    if (linked) return NextResponse.json({ error: 'Desvincula sus cobros o pagos antes de eliminarla' }, { status: 409 });
    const deleted = await prisma.businessActivity.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Operación no encontrada' }, { status: 404 });
}
