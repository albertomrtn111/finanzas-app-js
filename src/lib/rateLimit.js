// Límite de intentos en memoria, por clave y ventana fija.
// La app corre en un único proceso, así que basta con memoria: se reinicia con cada despliegue.
const buckets = new Map();
const MAX_KEYS = 50000;

function sweep(now) {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

// Indica si la clave ya ha agotado su límite, sin contar un nuevo intento.
export function isLimited(key, { limit }, now = Date.now()) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) return { limited: false, retryAfterMs: 0 };
    return { limited: bucket.count >= limit, retryAfterMs: bucket.resetAt - now };
}

// Cuenta un intento. Devuelve si todavía estaba permitido.
export function hit(key, { limit, windowMs }, now = Date.now()) {
    if (buckets.size > MAX_KEYS) sweep(now);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
    }
    bucket.count += 1;
    return { allowed: bucket.count <= limit, retryAfterMs: bucket.resetAt - now };
}

export function reset(key) {
    buckets.delete(key);
}

export function resetAll() {
    buckets.clear();
}

// IP del cliente detrás de Traefik: X-Real-Ip la pone el propio proxy; si no está, la última
// dirección de X-Forwarded-For (la que añadió el proxy más cercano), que el cliente no controla.
export function clientIp(headers) {
    const get = name => (typeof headers?.get === 'function' ? headers.get(name) : headers?.[name]);
    const realIp = String(get('x-real-ip') || '').trim();
    if (realIp) return realIp;
    const forwarded = String(get('x-forwarded-for') || '').split(',').map(part => part.trim()).filter(Boolean);
    return forwarded.at(-1) || 'desconocida';
}

export const LIMITS = {
    // Inicio de sesión: intentos fallidos por email y IP, por email (ataques repartidos) y por IP.
    loginEmailIp: { limit: 5, windowMs: 15 * 60 * 1000 },
    loginEmail: { limit: 20, windowMs: 15 * 60 * 1000 },
    loginIp: { limit: 50, windowMs: 15 * 60 * 1000 },
    register: { limit: 5, windowMs: 60 * 60 * 1000 },
    passwordChange: { limit: 5, windowMs: 15 * 60 * 1000 },
};

export function minutesText(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}
