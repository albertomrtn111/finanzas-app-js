import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { createToken, listTokens, mcpUrl } from '@/lib/mcp/access';

const noStore = { 'Cache-Control': 'no-store' };

// Accesos al MCP del usuario de la sesión y la dirección para conectarse.
export async function GET(request) {
    const auth = await requireUser({ headers: noStore });
    if (auth.response) return auth.response;
    return NextResponse.json({ url: mcpUrl(request), accesos: await listTokens(auth.userId) }, { headers: noStore });
}

// Crea un acceso. El token solo se devuelve en esta respuesta.
export async function POST(request) {
    const auth = await requireUser({ headers: noStore });
    if (auth.response) return auth.response;
    const { userId } = auth;
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
        return NextResponse.json({ error: 'Petición inválida' }, { status: 415, headers: noStore });
    }
    const body = await request.json().catch(() => ({}));
    const result = await createToken(userId, body?.name);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore });
    return NextResponse.json({ url: mcpUrl(request), token: result.token, acceso: result.access }, { status: 201, headers: noStore });
}
