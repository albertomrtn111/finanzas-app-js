import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, validId } from '@/lib/businessAccess';

const MAX_BYTES = 5 * 1024 * 1024;
const MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function matchesMime(data, mime) {
    if (mime === 'application/pdf') return data.subarray(0, 5).toString() === '%PDF-';
    if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
    if (mime === 'image/webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
    return false;
}

export async function POST(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const form = await request.formData().catch(() => null);
    const activityId = validId(form?.get('activityId'));
    const file = form?.get('file');
    if (!activityId || !file || typeof file.arrayBuffer !== 'function' || file.size < 1 || file.size > MAX_BYTES || !MIME.has(file.type)) {
        return NextResponse.json({ error: 'Adjunta un PDF o imagen de hasta 5 MB' }, { status: 400 });
    }
    const activity = await prisma.businessActivity.findFirst({ where: { id: activityId, business_id: context.business.id } });
    if (!activity) return NextResponse.json({ error: 'Operación no encontrada' }, { status: 404 });
    const data = Buffer.from(await file.arrayBuffer());
    if (!matchesMime(data, file.type)) return NextResponse.json({ error: 'El archivo no coincide con el formato indicado' }, { status: 400 });
    const filename = String(file.name || 'documento').slice(0, 180).replace(/[\r\n/\\]/g, '_');
    const attachment = await prisma.businessAttachment.create({ data: { business_id: context.business.id, activity_id: activityId, filename, mime_type: file.type, data }, select: { id: true, filename: true, mime_type: true } });
    return NextResponse.json(attachment, { status: 201 });
}

export async function GET(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 });
    const attachment = await prisma.businessAttachment.findFirst({ where: { id, business_id: context.business.id } });
    if (!attachment) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    return new NextResponse(attachment.data, { headers: { 'Content-Type': attachment.mime_type, 'Content-Disposition': `attachment; filename="${attachment.filename.replace(/[";]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function DELETE(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 });
    const deleted = await prisma.businessAttachment.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
}
