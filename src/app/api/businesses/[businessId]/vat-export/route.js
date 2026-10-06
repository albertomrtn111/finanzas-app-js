import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext } from '@/lib/businessAccess';

function cell(value) {
    const text = String(value ?? '');
    const safe = /^[=+@]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const period = new URL(request.url).searchParams.get('period');
    if (!/^\d{4}-Q[1-4]$/.test(period || '')) return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
    const activities = await prisma.businessActivity.findMany({ where: { business_id: context.business.id, vat_period: period, document_kind: { not: 'NONE' } }, orderBy: [{ document_date: 'asc' }, { id: 'asc' }] });
    const header = ['Tipo', 'Número', 'Fecha factura', 'Fecha operación', 'Contraparte', 'NIF', 'Concepto', 'Base', 'Clasificación IVA', 'IVA %', 'Cuota IVA', 'IVA deducible', 'Total factura'];
    const rows = activities.flatMap(activity => (Array.isArray(activity.tax_lines) ? activity.tax_lines : []).map(line => [
        activity.direction === 'INCOME' ? 'Emitida' : 'Recibida', activity.document_number,
        activity.document_date?.toISOString().slice(0, 10), activity.occurred_on.toISOString().slice(0, 10),
        activity.counterparty_name, activity.counterparty_tax_id, activity.description,
        line.base, line.vat_treatment || 'DOMESTIC', line.vat_rate, line.vat_amount, activity.direction === 'EXPENSE' ? line.deductible_vat : '', activity.total_amount
    ]));
    const csv = '\uFEFF' + [header, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="iva-${period}.csv"`, 'Cache-Control': 'private, no-store' } });
}
