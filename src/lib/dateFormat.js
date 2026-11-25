// Fechas en español para la interfaz. Las fechas de la app son días (AAAA-MM-DD) sin hora.

const dayKey = value => {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const asUtc = key => new Date(`${key}T00:00:00.000Z`);
const fmt = options => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...options });

// Hoy en España (AAAA-MM-DD).
export function todayKey(now = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(now);
}

// «24 nov 2026»
export function formatDate(value) {
    const key = dayKey(value);
    return key ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(asUtc(key)).replace('.', '') : '—';
}

// «24 de noviembre de 2026»
export function formatDateLong(value) {
    const key = dayKey(value);
    return key ? fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(asUtc(key)) : '—';
}

// Cabecera de un día en una lista: «Hoy», «Ayer», «lunes, 23 de noviembre» o, de otro año, «23 nov 2025».
export function formatDayHeading(value, now = new Date()) {
    const key = dayKey(value);
    if (!key) return '—';
    const today = todayKey(now);
    if (key === today) return 'Hoy';
    const yesterday = new Date(asUtc(today).getTime() - 86400000).toISOString().slice(0, 10);
    if (key === yesterday) return 'Ayer';
    if (key.slice(0, 4) !== today.slice(0, 4)) return formatDate(key);
    return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(asUtc(key));
}

// Fecha y hora de un registro: «24 nov 2026, 18:05» (hora de España).
export function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date).replace('.', '');
}
