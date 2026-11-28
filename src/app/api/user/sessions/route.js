import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import prisma from '@/lib/db';

// Cierra todas las sesiones del usuario en todos los dispositivos, también la actual.
// Los accesos de la IA (MCP) no dependen de la sesión: se revocan aparte en Mi Perfil.
export async function DELETE() {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    await prisma.user.update({ where: { id: auth.userId }, data: { session_version: { increment: 1 } } });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
