import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext, businessRoute, jsonBody } from '@/lib/businessAccess';
import { cleanText } from '@/lib/business';

export const GET = businessRoute(async (_request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    return context.response || NextResponse.json(context.business);
});

export const PATCH = businessRoute(async (request, { params }) => {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const body = await jsonBody(request);
    const name = cleanText(body.name, 120, true);
    const legal_name = cleanText(body.legal_name, 160);
    const tax_id = cleanText(body.tax_id, 32);
    const kind = body.kind;
    const vat_regime = body.vat_regime || 'GENERAL';
    if (!name || legal_name === null || tax_id === null || !['SELF_EMPLOYED', 'COMPANY'].includes(kind) || vat_regime !== 'GENERAL') {
        return NextResponse.json({ error: 'Datos de empresa inválidos. El régimen general de IVA es el disponible actualmente.' }, { status: 400 });
    }
    const business = await prisma.business.update({ where: { id: context.business.id }, data: { name, legal_name: legal_name || null, tax_id: tax_id || null, kind, vat_regime } });
    return NextResponse.json(business);
});
