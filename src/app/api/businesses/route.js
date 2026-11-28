import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessRoute, jsonBody } from '@/lib/businessAccess';
import { requireUser } from '@/lib/session';
import { cleanText } from '@/lib/business';

export const GET = businessRoute(async () => {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const businesses = await prisma.business.findMany({ where: { owner_user_id: auth.userId }, orderBy: { id: 'asc' } });
    return NextResponse.json(businesses);
});

export const POST = businessRoute(async (request) => {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    if (auth.accountMode === 'UNSET') return NextResponse.json({ error: 'Completa primero la configuración de tu cuenta' }, { status: 409 });
    const body = await jsonBody(request);
    const name = cleanText(body.name, 120, true);
    const kind = body.kind || 'SELF_EMPLOYED';
    if (!name || !['SELF_EMPLOYED', 'COMPANY'].includes(kind)) return NextResponse.json({ error: 'Nombre o tipo de empresa inválido' }, { status: 400 });
    const { userId } = auth;
    const business = await prisma.$transaction(async tx => {
        const created = await tx.business.create({ data: { owner_user_id: userId, name, kind } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { account_mode: true } });
        if (user?.account_mode === 'PERSONAL') await tx.user.update({ where: { id: userId }, data: { account_mode: 'BOTH' } });
        return created;
    });
    return NextResponse.json(business, { status: 201 });
});
