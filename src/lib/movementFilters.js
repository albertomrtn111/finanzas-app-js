// Filtros opcionales de GET /api/expenses y GET /api/income (Tarea NF-19).
// Sin Prisma ni Next para poder probarlo: valida los parámetros y construye el where.
// Sin filtros, el where es el de siempre ({ user_id }), así que las llamadas antiguas no cambian.
import { parseDate } from './apiValidation.js';

// Campos en los que busca «q», sin distinguir mayúsculas.
export const SEARCH_FIELDS = {
    expense: ['notes', 'subcategory', 'category', 'payment_method'],
    income: ['notes', 'source', 'category'],
};

const PARAMS = ['q', 'category', 'from', 'to', 'min', 'max'];
const MAX_TEXT = 100;
const MAX_TERMS = 8;
const AMOUNT = /^\d{1,10}(?:\.\d{1,2})?$/;

// searchParams (URLSearchParams) → { value: { q, category, from, to, min, max } } o { error } en español.
// Los parámetros vacíos se ignoran; los desconocidos (limit, offset…) no se tocan aquí.
export function parseMovementFilters(searchParams) {
    for (const name of PARAMS) {
        if (searchParams.getAll(name).length > 1) return { error: `El filtro «${name}» aparece repetido` };
    }
    const read = name => (searchParams.get(name) ?? '').trim();
    const filters = {};

    const q = read('q');
    if (q.length > MAX_TEXT) return { error: `La búsqueda no puede superar ${MAX_TEXT} caracteres` };
    if (q) filters.q = q;

    const category = read('category');
    if (category.length > MAX_TEXT) return { error: `La categoría no puede superar ${MAX_TEXT} caracteres` };
    if (category) filters.category = category;

    for (const [name, label] of [['from', 'desde'], ['to', 'hasta']]) {
        const value = read(name);
        if (!value) continue;
        if (!parseDate(value)) return { error: `La fecha «${label}» (${name}) debe tener el formato AAAA-MM-DD y ser válida` };
        filters[name] = value;
    }
    if (filters.from && filters.to && filters.from > filters.to) {
        return { error: 'La fecha «desde» no puede ser posterior a la fecha «hasta»' };
    }

    for (const [name, label] of [['min', 'mínimo'], ['max', 'máximo']]) {
        const value = read(name);
        if (!value) continue;
        if (!AMOUNT.test(value)) {
            return { error: `El importe ${label} (${name}) debe ser un número positivo con punto decimal y como mucho dos decimales, por ejemplo 12.50` };
        }
        filters[name] = value;
    }
    if (filters.min && filters.max && Number(filters.min) > Number(filters.max)) {
        return { error: 'El importe mínimo no puede ser mayor que el máximo' };
    }

    return { value: filters };
}

// where de Prisma, siempre limitado al usuario de la sesión. Cada palabra de «q» tiene que
// aparecer en alguno de los campos de búsqueda («mercadona tarjeta» exige las dos).
export function movementWhere(kind, userId, filters = {}) {
    const where = { user_id: userId };
    if (filters.category) where.category = filters.category;
    if (filters.from || filters.to) {
        where.date = {
            ...(filters.from ? { gte: parseDate(filters.from) } : {}),
            ...(filters.to ? { lte: parseDate(filters.to) } : {}),
        };
    }
    if (filters.min || filters.max) {
        where.amount = {
            ...(filters.min ? { gte: filters.min } : {}),
            ...(filters.max ? { lte: filters.max } : {}),
        };
    }
    if (filters.q) {
        const terms = filters.q.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
        where.AND = terms.map(term => ({
            OR: SEARCH_FIELDS[kind].map(field => ({ [field]: { contains: term, mode: 'insensitive' } })),
        }));
    }
    return where;
}

// Cabeceras con el número de resultados y la suma de importes del filtro completo (no solo de
// la página). El cuerpo sigue siendo la lista de siempre.
export function totalsHeaders(aggregate) {
    const sum = aggregate?._sum?.amount;
    return {
        'X-Total-Count': String(aggregate?._count?._all ?? 0),
        // Decimal de Prisma (exacto) o número.
        'X-Total-Amount': sum === null || sum === undefined ? '0.00' : (typeof sum === 'string' ? Number(sum) : sum).toFixed(2),
    };
}
