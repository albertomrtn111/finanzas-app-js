import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function businessContext(businessId) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    const id = Number(businessId);
    if (!Number.isSafeInteger(id) || id < 1) return { response: NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 }) };
    const business = await prisma.business.findFirst({ where: { id, owner_user_id: Number(session.user.id) } });
    if (!business) return { response: NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 }) };
    return { business, userId: Number(session.user.id) };
}

export function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
