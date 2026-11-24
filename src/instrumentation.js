// Arranque y errores del servidor (https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).

const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];

// Se ejecuta una vez al arrancar: si falta configuración imprescindible, la app no arranca
// y el despliegue lo detecta, en vez de fallar más tarde en cada petición.
export function register() {
    if (process.env.NEXT_RUNTIME === 'edge' || process.env.NEXT_PHASE === 'phase-production-build') return;
    const missing = REQUIRED.filter(name => !String(process.env[name] || '').trim());
    if (missing.length) throw new Error(`Falta configuración obligatoria: ${missing.join(', ')}`);
    if (process.env.NODE_ENV === 'production' && process.env.NEXTAUTH_SECRET.length < 32) {
        console.error(JSON.stringify({ nivel: 'aviso', mensaje: 'NEXTAUTH_SECRET tiene menos de 32 caracteres' }));
    }
}

// Cada error del servidor queda en una línea JSON en los registros de Docker
// (docker logs finanzas_next | grep '"nivel":"error"'), sin cabeceras ni cookies.
export function onRequestError(error, request, context) {
    const entry = {
        nivel: 'error',
        fecha: new Date().toISOString(),
        mensaje: error instanceof Error ? error.message : String(error),
        digest: typeof error === 'object' && error && 'digest' in error ? String(error.digest) : undefined,
        metodo: request?.method,
        ruta: String(request?.path || '').split('?')[0],
        tipo: context?.routeType,
        fichero: context?.routePath,
        version: (process.env.APP_COMMIT || 'desconocida').slice(0, 7),
    };
    if (error instanceof Error && error.stack) entry.traza = error.stack.split('\n').slice(0, 6).join('\n');
    console.error(JSON.stringify(entry));
}
