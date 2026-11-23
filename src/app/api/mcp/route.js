import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateMcpRequest, createFinanceServer } from '@/lib/mcp/server';

export const runtime = 'nodejs';

function unauthorized() {
    return Response.json(
        { jsonrpc: '2.0', error: { code: -32001, message: 'No autorizado: falta un token de acceso válido' }, id: null },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="nextfinance"', 'Cache-Control': 'no-store' } },
    );
}

// Servidor MCP sin sesión: cada petición crea su servidor, ligado al usuario del token.
async function handle(request) {
    const user = await authenticateMcpRequest(request);
    if (!user) return unauthorized();
    const server = createFinanceServer(user);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
        const response = await transport.handleRequest(request);
        response.headers.set('Cache-Control', 'no-store');
        return response;
    } finally {
        await transport.close().catch(() => {});
        await server.close().catch(() => {});
    }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
