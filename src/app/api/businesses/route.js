import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { cleanText } from '@/lib/business';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const businesses = await prisma.business.findMany({ where: { owner_user_id: Number(session.user.id) }, orderBy: { id: 'asc' } });
    return NextResponse.json(businesses);
}

export async function POST(request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (session.user.accountMode === 'UNSET') return NextResponse.json({ error: 'Completa primero la configuración de tu cuenta' }, { status: 409 });
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body.name, 120, true);
    const kind = body.kind || 'SELF_EMPLOYED';
    if (!name || !['SELF_EMPLOYED', 'COMPANY'].includes(kind)) return NextResponse.json({ error: 'Nombre o tipo de empresa inválido' }, { status: 400 });
    const userId = Number(session.user.id);
    const business = await prisma.$transaction(async tx => {
        const created = await tx.business.create({ data: { owner_user_id: userId, name, kind } });
        const user = await tx.user.findUnique({ where: { id: userId }, select: { account_mode: true } });
        if (user?.account_mode === 'PERSONAL') await tx.user.update({ where: { id: userId }, data: { account_mode: 'BOTH' } });
        return created;
    });
    return NextResponse.json(business, { status: 201 });
}
