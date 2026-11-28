// Convierte resultados de Prisma (Decimal, Date) en datos JSON simples.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/;

// La copia fiel para el registro de cambios vive con él (src/lib/changeRecords.js).
export { snapshot } from '../changeRecords.js';

// Versión para mostrar a la IA: las fechas sin hora quedan como AAAA-MM-DD.
export function plain(value) {
    return JSON.parse(JSON.stringify(value ?? null), (_key, item) =>
        typeof item === 'string' && DATE_ONLY.test(item) ? item.slice(0, 10) : item);
}

export function toCents(value) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function fromCents(cents) {
    return Math.round(cents) / 100;
}

export function dateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
}
