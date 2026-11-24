import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revokeToken } from '@/lib/mcp/access';

// Revoca un acceso del usuario de la sesión. Un id ajeno se trata igual que uno inexistente.
export async function DELETE(_request, { params }) {
    const session = await getServerSession(authOptions);
    const userId = Number(session?.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { tokenId } = await params;
    const id = Number(tokenId);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Acceso no encontrado' }, { status: 404 });
    const revoked = await revokeToken(userId, id);
    if (!revoked) return NextResponse.json({ error: 'Acceso no encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
