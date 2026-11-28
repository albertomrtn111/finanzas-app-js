import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { revokeToken } from '@/lib/mcp/access';

// Revoca un acceso del usuario de la sesión. Un id ajeno se trata igual que uno inexistente.
export async function DELETE(_request, { params }) {
    const auth = await requireUser();
    if (auth.response) return auth.response;
    const { userId } = auth;
    const { tokenId } = await params;
    const id = Number(tokenId);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Acceso no encontrado' }, { status: 404 });
    const revoked = await revokeToken(userId, id);
    if (!revoked) return NextResponse.json({ error: 'Acceso no encontrado' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
