import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createToken, listTokens, mcpUrl } from '@/lib/mcp/access';

const noStore = { 'Cache-Control': 'no-store' };

async function sessionUserId() {
    const session = await getServerSession(authOptions);
    const id = Number(session?.user?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Accesos al MCP del usuario de la sesión y la dirección para conectarse.
export async function GET(request) {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: noStore });
    return NextResponse.json({ url: mcpUrl(request), accesos: await listTokens(userId) }, { headers: noStore });
}

// Crea un acceso. El token solo se devuelve en esta respuesta.
export async function POST(request) {
    const userId = await sessionUserId();
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: noStore });
    if (!(request.headers.get('content-type') || '').includes('application/json')) {
        return NextResponse.json({ error: 'Petición inválida' }, { status: 415, headers: noStore });
    }
    const body = await request.json().catch(() => ({}));
    const result = await createToken(userId, body?.name);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore });
    return NextResponse.json({ url: mcpUrl(request), token: result.token, acceso: result.access }, { status: 201, headers: noStore });
}
