import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// Cierra todas las sesiones del usuario en todos los dispositivos, también la actual.
// Los accesos de la IA (MCP) no dependen de la sesión: se revocan aparte en Mi Perfil.
export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    await prisma.user.update({ where: { id: Number(session.user.id) }, data: { session_version: { increment: 1 } } });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
