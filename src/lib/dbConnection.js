// Configuración del pool de pg que usa Prisma 7 a partir de la DATABASE_URL de siempre.
//
// Prisma 6 leía de la URL connection_limit, pool_timeout, connect_timeout y schema; con el
// adaptador de pg nadie los lee, así que se traducen aquí para que la misma URL siga valiendo.
// El resto (usuario, host, sslmode…) lo interpreta pg; los parámetros que no conoce, como
// pgbouncer, los ignora.

// Prisma 6 esperaba 5 s a conectar y 10 s a que quedase libre una conexión; pg usa un único
// tiempo para las dos cosas y por defecto espera sin límite.
const DEFAULT_TIMEOUT_MS = 10_000;
// Prisma 6 cerraba las conexiones ociosas a los 300 s; pg, a los 10 s.
const IDLE_TIMEOUT_MS = 300_000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function seconds(value) {
    if (value === null || value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

export function pgConnection(url) {
    const pool = { connectionString: url, connectionTimeoutMillis: DEFAULT_TIMEOUT_MS, idleTimeoutMillis: IDLE_TIMEOUT_MS };
    let params;
    try {
        params = new URL(url).searchParams;
    } catch {
        // Sin URL (al compilar) o con una que pg sabrá rechazar al conectar.
        return { pool, schema: undefined };
    }

    const limit = Number(params.get('connection_limit'));
    if (Number.isInteger(limit) && limit > 0) pool.max = limit;

    const timeouts = [seconds(params.get('pool_timeout')), seconds(params.get('connect_timeout'))].filter(value => value !== null);
    // 0 en Prisma significa «sin límite», igual que en pg.
    if (timeouts.length) pool.connectionTimeoutMillis = timeouts.includes(0) ? 0 : Math.max(...timeouts) * 1000;

    const schema = params.get('schema') || undefined;
    // Las consultas en SQL escrito a mano no llevan esquema: también tienen que ir a ese.
    if (schema && schema !== 'public' && IDENTIFIER.test(schema)) pool.options = `-c search_path=${schema}`;
    return { pool, schema };
}
