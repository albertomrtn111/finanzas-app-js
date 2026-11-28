import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, businessRoute, validId } from '@/lib/businessAccess';
import { ATTACHMENT_MIME, FORM_OVERHEAD_BYTES, MAX_ATTACHMENT_BYTES, attachmentQuotaBytes, cleanFilename, contentDisposition, formatMb, matchesMime } from '@/lib/attachments';

// Los documentos adjuntos no pasan por el registro de cambios (src/lib/changeLog.js): el registro no
// guarda el archivo, así que un documento borrado no se podría recuperar al deshacer.

export const POST = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;

    // Rechazar los envíos grandes antes de leerlos: formData() carga el cuerpo entero en memoria.
    const declared = Number(request.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0) return NextResponse.json({ error: 'Falta el tamaño del envío' }, { status: 411 });
    if (declared > MAX_ATTACHMENT_BYTES + FORM_OVERHEAD_BYTES) return NextResponse.json({ error: 'El archivo supera el máximo de 5 MB' }, { status: 413 });

    const form = await request.formData().catch(() => null);
    const activityId = validId(form?.get('activityId'));
    const file = form?.get('file');
    if (!activityId || !file || typeof file.arrayBuffer !== 'function' || file.size < 1 || !ATTACHMENT_MIME.has(file.type)) {
        return NextResponse.json({ error: 'Adjunta un PDF o imagen de hasta 5 MB' }, { status: 400 });
    }
    if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'El archivo supera el máximo de 5 MB' }, { status: 413 });

    const activity = await prisma.businessActivity.findFirst({ where: { id: activityId, business_id: context.business.id } });
    if (!activity) return NextResponse.json({ error: 'Operación no encontrada' }, { status: 404 });

    // Espacio usado por todas las empresas del usuario.
    const [{ used }] = await prisma.$queryRaw`
        SELECT COALESCE(SUM(octet_length(a.data)), 0)::bigint AS used
        FROM business_attachments a JOIN businesses b ON b.id = a.business_id
        WHERE b.owner_user_id = ${context.business.owner_user_id}`;
    const quota = attachmentQuotaBytes();
    if (Number(used) + file.size > quota) {
        return NextResponse.json({ error: `No queda espacio para documentos: usas ${formatMb(Number(used))} de ${formatMb(quota)}. Borra alguno antes de subir más.` }, { status: 413 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    if (!matchesMime(data, file.type)) return NextResponse.json({ error: 'El archivo no coincide con el formato indicado' }, { status: 400 });
    const attachment = await prisma.businessAttachment.create({ data: { business_id: context.business.id, activity_id: activityId, filename: cleanFilename(file.name), mime_type: file.type, data }, select: { id: true, filename: true, mime_type: true } });
    return NextResponse.json(attachment, { status: 201 });
});

export const GET = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 });
    const attachment = await prisma.businessAttachment.findFirst({ where: { id, business_id: context.business.id } });
    if (!attachment) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    return new NextResponse(attachment.data, { headers: { 'Content-Type': attachment.mime_type, 'Content-Disposition': contentDisposition(attachment.filename), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});

export const DELETE = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const id = validId(new URL(request.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ error: 'Documento inválido' }, { status: 400 });
    const deleted = await prisma.businessAttachment.deleteMany({ where: { id, business_id: context.business.id } });
    return deleted.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
});
