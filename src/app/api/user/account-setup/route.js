import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import prisma from '@/lib/db';
import { cleanText } from '@/lib/business';

export async function POST(request) {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const mode = body.accountMode;
    const businessName = cleanText(body.businessName, 120, mode !== 'PERSONAL');
    if (!['PERSONAL', 'COMPANY', 'BOTH'].includes(mode) || businessName === null || (mode !== 'PERSONAL' && !['SELF_EMPLOYED', 'COMPANY'].includes(body.businessKind))) {
        return NextResponse.json({ error: 'Elige el tipo de cuenta y completa los datos del negocio' }, { status: 400 });
    }
    const { userId } = auth;
    const result = await prisma.$transaction(async tx => {
        const updated = await tx.user.updateMany({ where: { id: userId, account_mode: 'UNSET' }, data: { account_mode: mode, onboarding_step: mode === 'COMPANY' ? 5 : 0 } });
        if (!updated.count) return false;
        if (mode !== 'PERSONAL') await tx.business.create({ data: { owner_user_id: userId, name: businessName, kind: body.businessKind } });
        return true;
    });
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'La cuenta ya está configurada' }, { status: 409 });
}
