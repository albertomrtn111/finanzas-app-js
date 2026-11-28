// Reglas de clasificación (Tarea NF-4), sin base de datos para poder probarlas:
//   - qué regla encaja con un concepto del banco y con cuánta confianza;
//   - qué aprender de cada movimiento confirmado o corregido;
//   - cómo deshacer lo aprendido sin bloquear el deshacer de los movimientos;
//   - validación de las reglas que crea o edita el usuario (web y MCP).
// Las escrituras en la base de datos están en src/lib/classificationRuleStore.js.
import { FLOW_TYPES } from './business.js';
import { conceptTokens, merchantKey, normalizeConcept } from './mcp/importing.js';

export const DIRECTIONS = ['OUT', 'IN'];
export const DESTINATIONS = ['EXPENSE', 'INCOME', 'BUSINESS'];
export const ORIGINS = ['LEARNED', 'MANUAL'];
export { FLOW_TYPES };

// Nombres para la IA, iguales que en preparar_importacion e importar_movimientos.
export const DIRECTION_TEXT = { OUT: 'salida', IN: 'entrada' };
export const DESTINATION_TEXT = { EXPENSE: 'gasto', INCOME: 'ingreso', BUSINESS: 'movimiento_empresa' };
export const ORIGIN_TEXT = { LEARNED: 'aprendida', MANUAL: 'manual' };
export const fromText = (map, value) => Object.keys(map).find(key => map[key] === value);

const CLASSIFICATION_FIELDS = ['destination', 'business_id', 'account_id', 'flow_type', 'category', 'subcategory', 'payment_method', 'expense_type', 'source'];
const IDENTITY_FIELDS = ['direction', 'merchant_key', 'pattern'];
// Lo que define a dónde manda la regla. Los usos (hits, last_used_at, example) no cuentan.
const SIGNATURE_FIELDS = [...IDENTITY_FIELDS, 'origin', ...CLASSIFICATION_FIELDS];
const STAT_FIELDS = ['hits', 'last_used_at', 'example'];

const MAX_EXAMPLE = 240;

const text = value => (value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim());

// Clasificación con solo los campos que tienen sentido en su destino.
export function normalizeClassification(c = {}) {
    const destination = c.destination;
    const business = destination === 'BUSINESS';
    return {
        destination,
        business_id: business ? c.business_id ?? null : null,
        account_id: business ? c.account_id ?? null : null,
        flow_type: business ? c.flow_type || 'OPERATING' : null,
        category: business ? null : text(c.category),
        subcategory: destination === 'EXPENSE' ? text(c.subcategory) : null,
        payment_method: destination === 'EXPENSE' ? text(c.payment_method) : null,
        expense_type: destination === 'EXPENSE' ? text(c.expense_type) : null,
        source: destination === 'INCOME' ? text(c.source) : null,
    };
}

export function sameClassification(a, b) {
    const left = normalizeClassification(a);
    const right = normalizeClassification(b);
    return CLASSIFICATION_FIELDS.every(field => (left[field] ?? null) === (right[field] ?? null));
}

// Lo que se aprende de un gasto o ingreso guardado: su concepto (las notas; en un ingreso sin notas,
// la fuente), el sentido y la clasificación. null si no hay texto con que reconocer el comercio.
export function learningItemFromRecord(kind, record) {
    const concept = text(record.notes) || (kind === 'income' ? text(record.source) : null);
    if (!concept) return null;
    const classification = kind === 'expense'
        ? { destination: 'EXPENSE', category: record.category, subcategory: record.subcategory, payment_method: record.payment_method, expense_type: record.expense_type }
        : { destination: 'INCOME', category: record.category, source: record.source };
    return { concept, direction: kind === 'expense' ? 'OUT' : 'IN', classification };
}

// ¿La corrección cambia la clasificación? Gastos: categoría, subcategoría o método de pago. Ingresos: categoría.
export function classificationChanged(kind, before, after) {
    const fields = kind === 'expense' ? ['category', 'subcategory', 'payment_method'] : ['category'];
    return fields.some(field => text(before[field]) !== text(after[field]));
}

// --- Coincidencia ---------------------------------------------------------------------------------

// Concepto preparado una vez para compararlo con todas las reglas.
export function parseConcept(concept) {
    const tokens = conceptTokens(concept);
    return { concept: String(concept || ''), normalized: ` ${normalizeConcept(concept)} `, key: tokens.slice(0, 2).join(' '), tokens };
}

function containsSequence(tokens, needle) {
    for (let start = 0; start + needle.length <= tokens.length; start += 1) {
        if (needle.every((token, offset) => tokens[start + offset] === token)) return true;
    }
    return false;
}

// Nivel de coincidencia de una regla con un concepto, o null:
//   exacta: misma clave de comercio; incluye: las palabras de la regla aparecen seguidas en el concepto;
//   contiene: regla sin comercio cuyo texto aparece en el concepto; parecida: misma primera palabra (4+ letras).
// Si la regla tiene «contiene», además tiene que aparecer ese texto.
export const LEVELS = { exacta: 4, contiene: 3, incluye: 3, parecida: 1 };

export function matchLevel(rule, parsed) {
    if (rule.pattern && !parsed.normalized.includes(` ${rule.pattern} `)) return null;
    if (!rule.merchant_key) return rule.pattern ? 'contiene' : null;
    if (!parsed.key) return null;
    if (rule.merchant_key === parsed.key) return 'exacta';
    const words = rule.merchant_key.split(' ');
    if (containsSequence(parsed.tokens, words)) return 'incluye';
    if (words[0].length >= 4 && parsed.tokens[0] === words[0]) return 'parecida';
    return null;
}

const time = value => (value ? new Date(value).getTime() : 0);

// Orden de preferencia: las coincidencias fuertes antes que las «parecidas»; dentro de cada grupo,
// las reglas manuales mandan; después, el nivel, las que exigen texto, las más usadas, la última usada.
function compareMatches(a, b) {
    const strong = m => (m.coincidencia === 'parecida' ? 0 : 1);
    const manual = m => (m.rule.origin === 'MANUAL' ? 1 : 0);
    return strong(b) - strong(a)
        || manual(b) - manual(a)
        || LEVELS[b.coincidencia] - LEVELS[a.coincidencia]
        || Number(Boolean(b.rule.pattern)) - Number(Boolean(a.rule.pattern))
        || (b.rule.hits || 0) - (a.rule.hits || 0)
        || time(b.rule.last_used_at) - time(a.rule.last_used_at)
        || (a.rule.id ?? Infinity) - (b.rule.id ?? Infinity);
}

// Mejor regla del mismo sentido para un concepto: { rule, coincidencia } o null.
export function bestRule(rules, concept, direction) {
    const parsed = typeof concept === 'string' || !concept?.normalized ? parseConcept(concept) : concept;
    let best = null;
    for (const rule of rules) {
        if (rule.direction !== direction) continue;
        const coincidencia = matchLevel(rule, parsed);
        if (!coincidencia) continue;
        const candidate = { rule, coincidencia };
        if (!best || compareMatches(candidate, best) < 0) best = candidate;
    }
    return best;
}

// Confianza de 0 a 1. Manual: 1. Aprendida: sube con las veces confirmada (1 → 0,6; 2 → 0,8; 4 → 0,9;
// 10 → 0,96). Una coincidencia «incluye» resta un poco y una «parecida», bastante más.
const LEVEL_FACTOR = { exacta: 1, contiene: 1, incluye: 0.95, parecida: 0.8 };

export function ruleConfidence(rule, coincidencia = 'exacta') {
    const base = rule.origin === 'MANUAL' ? 1 : 1 - 0.4 / Math.max(rule.hits || 0, 1);
    return Math.round(base * (LEVEL_FACTOR[coincidencia] ?? 1) * 100) / 100;
}

// --- Aprendizaje ----------------------------------------------------------------------------------

// Qué aprender de unos movimientos confirmados, en orden: items [{ concept, direction, classification }].
//   - Si la mejor regla ya da esa clasificación, se refuerza (una vez más usada), aunque sea manual.
//   - Si la mejor regla es manual (y no solo «parecida»), manda ella: no se toca ni se crea otra.
//   - Si no, se cambia o se crea la regla aprendida de ese comercio exacto, con 1 uso.
// Devuelve { writes, results }: writes, una escritura por regla ({ type: 'create', data } o
// { type: 'update', id, before, data }); results, qué pasó con cada item.
export function planLearning(rules, items, now = new Date()) {
    const working = rules.map(rule => ({ ...rule }));
    const touched = new Map();
    const touch = rule => { if (!touched.has(rule)) touched.set(rule, { ...rule }); };
    const results = [];
    for (const item of items) {
        const classification = normalizeClassification(item.classification);
        const parsed = parseConcept(item.concept);
        const example = parsed.concept.slice(0, MAX_EXAMPLE) || null;
        const match = bestRule(working, parsed, item.direction);
        if (match && sameClassification(match.rule, classification)) {
            touch(match.rule);
            Object.assign(match.rule, { hits: (match.rule.hits || 0) + 1, last_used_at: now, example });
            results.push({ accion: 'reforzada', rule: match.rule });
            continue;
        }
        if (match && match.rule.origin === 'MANUAL' && match.coincidencia !== 'parecida') {
            results.push({ accion: 'manda_manual', rule: match.rule });
            continue;
        }
        if (!parsed.key) {
            results.push({ accion: 'sin_comercio', rule: null });
            continue;
        }
        let exact = working.find(rule => rule.direction === item.direction && rule.merchant_key === parsed.key && !rule.pattern);
        if (exact?.origin === 'MANUAL') {
            results.push({ accion: 'manda_manual', rule: exact });
            continue;
        }
        if (exact) {
            touch(exact);
            Object.assign(exact, classification, { hits: 1, last_used_at: now, example });
            results.push({ accion: 'cambiada', rule: exact });
            continue;
        }
        exact = { id: null, direction: item.direction, merchant_key: parsed.key, pattern: '', ...classification, origin: 'LEARNED', hits: 1, example, last_used_at: now };
        working.push(exact);
        touched.set(exact, null);
        results.push({ accion: 'creada', rule: exact });
    }
    const writes = [];
    for (const [rule, original] of touched) {
        const data = Object.fromEntries([...SIGNATURE_FIELDS, ...STAT_FIELDS].map(field => [field, rule[field] ?? null]));
        data.pattern = data.pattern ?? '';
        data.hits = data.hits ?? 0;
        writes.push(original ? { type: 'update', id: rule.id, before: original, data, rule } : { type: 'create', data, rule });
    }
    return { writes, results };
}

// --- Deshacer -------------------------------------------------------------------------------------

function signature(record) {
    return JSON.stringify(SIGNATURE_FIELDS.map(field => record?.[field] ?? (field === 'pattern' || field === 'merchant_key' ? '' : null)));
}

function pick(record, fields) {
    return Object.fromEntries(fields.map(field => [field, record?.[field] ?? null]));
}

// Qué hacer al deshacer un cambio de una regla. entry: { action, entity_id, before, after } del
// registro de cambios; current: la regla ahora (o null). Devuelve { op: 'none' | 'delete' | 'update' |
// 'create', data?, message } o lanza un error.
//   - Lo aprendido (action LEARN) nunca bloquea: si la regla ya no existe o se cambió después (otra
//     corrección o una edición manual), se deja como está. Si solo se reforzó, se quitan esos usos.
//   - Los cambios manuales (CREATE, UPDATE, DELETE) se comportan como los demás registros: si la
//     regla cambió después, hace falta forzar.
export function planRuleRevert(entry, current, force = false) {
    const id = entry.entity_id;
    const learning = entry.action === 'LEARN';
    const { before, after } = entry;
    if (entry.action === 'DELETE') {
        if (current) return { op: 'none', message: `La regla ${id} ya existe` };
        return { op: 'create', data: { id, user_id: before.user_id, ...pick(before, [...SIGNATURE_FIELDS, ...STAT_FIELDS]), created_at: before.created_at }, message: `Recuperada la regla ${id}` };
    }
    if (!current) {
        if (learning || !before) return { op: 'none', message: `La regla ${id} ya no existía` };
        throw new Error(`La regla ${id} ya no existe`);
    }
    const untouched = signature(current) === signature(after);
    if (!untouched && !force) {
        if (learning) return { op: 'none', message: `La regla ${id} ha cambiado después; se deja como está` };
        throw new Error(`La regla ${id} ha cambiado después; usa forzar para ${before ? 'restaurarla' : 'borrarla'} igualmente`);
    }
    if (!before) {
        // Usos posteriores (otras importaciones la reforzaron): la regla se queda con esos usos.
        const later = learning && untouched ? (current.hits || 0) - (after.hits || 0) : 0;
        if (later > 0) return { op: 'update', data: { hits: later }, message: `La regla ${id} se mantiene porque se ha usado después` };
        return { op: 'delete', message: `Borrada la regla ${id} que se había ${learning ? 'aprendido' : 'creado'}` };
    }
    if (learning && untouched && signature(before) === signature(after)) {
        const hits = Math.max(0, (current.hits || 0) - ((after.hits || 0) - (before.hits || 0)));
        if (hits === 0 && current.origin === 'LEARNED') return { op: 'delete', message: `Borrada la regla ${id}: ya no la respalda ningún movimiento` };
        const data = { hits };
        if (time(current.last_used_at) === time(after.last_used_at)) Object.assign(data, pick(before, ['last_used_at', 'example']));
        return { op: 'update', data, message: `Quitados de la regla ${id} los usos de ese cambio` };
    }
    // Se restaura a dónde mandaba antes. Lo aprendido recupera también sus usos; una edición
    // manual conserva los usos de ahora.
    const data = pick(before, learning ? [...SIGNATURE_FIELDS, ...STAT_FIELDS] : SIGNATURE_FIELDS);
    data.pattern = data.pattern ?? '';
    data.merchant_key = data.merchant_key ?? '';
    if (data.hits === null) delete data.hits;
    return { op: 'update', data, message: `Restaurada la regla ${id} a su estado anterior` };
}

// --- Reglas del usuario ---------------------------------------------------------------------------

const MAX = { merchant: 240, pattern: 120, category: 100, subcategory: 100, payment_method: 50, expense_type: 50, source: 150 };

function positiveId(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function optional(value, label, max) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new Error(`${label} tiene que ser un texto`);
    if (value.trim().length > max) throw new Error(`${label} no puede superar ${max} caracteres`);
    return value.trim() || null;
}

// Datos de una regla manual: { value } o { error }. input (nombres de la base de datos):
// { merchant, pattern, direction, destination, business_id, account_id, flow_type, category,
//   subcategory, payment_method, expense_type, source }. merchant es el comercio como lo escribe
// el usuario o el banco («Mercadona», «COMPRA TARJ MERCADONA VALENCIA»); se guarda su clave.
// Con existing (al editar), lo que no venga en input se toma de la regla actual.
export function parseRuleInput(input, existing = null) {
    try {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Datos inválidos');
        const base = existing ? { ...existing, merchant: existing.merchant_key } : {};
        const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
        // Al cambiar de destino sin indicar el sentido, se deduce del nuevo destino.
        if (existing && input.destination && input.destination !== existing.destination && input.direction === undefined) merged.direction = null;
        const destination = merged.destination;
        if (!DESTINATIONS.includes(destination)) throw new Error('Elige a dónde va: gasto, ingreso o movimiento de empresa');

        const merchant = optional(merged.merchant, 'El comercio', MAX.merchant);
        const patternText = optional(merged.pattern, 'El texto que debe contener', MAX.pattern);
        const merchant_key = merchant ? merchantKey(merchant) : '';
        const pattern = patternText ? normalizeConcept(patternText) : '';
        if (patternText && !pattern) throw new Error('El texto que debe contener no tiene letras ni números con que buscar');
        if (!merchant_key && !pattern) {
            throw new Error(merchant
                ? 'El comercio solo tiene palabras que ponen todos los bancos («compra», «tarjeta»…). Escribe el nombre del comercio o usa «contiene»'
                : 'Indica el comercio o el texto que debe contener el concepto');
        }

        let direction = merged.direction ?? null;
        if (destination === 'EXPENSE') {
            if (direction && direction !== 'OUT') throw new Error('Un gasto es una salida de dinero');
            direction = 'OUT';
        } else if (destination === 'INCOME') {
            if (direction && direction !== 'IN') throw new Error('Un ingreso es una entrada de dinero');
            direction = 'IN';
        } else if (!DIRECTIONS.includes(direction)) {
            throw new Error('Indica si el movimiento de empresa es una salida o una entrada de dinero');
        }

        const value = { direction, merchant_key, pattern, ...normalizeClassification({ destination }) };
        if (destination === 'BUSINESS') {
            value.business_id = positiveId(merged.business_id);
            value.account_id = positiveId(merged.account_id);
            if (!value.business_id) throw new Error('Elige la empresa');
            if (!value.account_id) throw new Error('Elige la cuenta de la empresa');
            value.flow_type = merged.flow_type || 'OPERATING';
            if (!FLOW_TYPES.includes(value.flow_type)) throw new Error('Tipo de flujo inválido');
        } else {
            const category = optional(merged.category, 'La categoría', MAX.category);
            if (!category) throw new Error('Indica la categoría');
            value.category = category;
            if (destination === 'EXPENSE') {
                value.subcategory = optional(merged.subcategory, 'La subcategoría', MAX.subcategory);
                value.payment_method = optional(merged.payment_method, 'El método de pago', MAX.payment_method);
                value.expense_type = optional(merged.expense_type, 'El tipo de gasto', MAX.expense_type);
            } else {
                value.source = optional(merged.source, 'La fuente', MAX.source);
            }
        }
        return { value };
    } catch (error) {
        return { error: error.message };
    }
}

// Sugerencia para preparar_importacion a partir de una regla, con la misma forma que la del historial.
export function suggestionFromRule(rule, coincidencia) {
    const destino = DESTINATION_TEXT[rule.destination];
    const fields = rule.destination === 'EXPENSE'
        ? { category: rule.category, subcategory: rule.subcategory, payment_method: rule.payment_method, expense_type: rule.expense_type }
        : rule.destination === 'INCOME'
            ? { category: rule.category, source: rule.source }
            : { empresa_id: rule.business_id, account_id: rule.account_id, flow_type: rule.flow_type || 'OPERATING' };
    return {
        destino, ...fields,
        confianza: ruleConfidence(rule, coincidencia),
        veces: rule.hits || 0,
        parecido_a: rule.example || rule.merchant_key || rule.pattern,
        origen: 'regla',
        regla_id: rule.id,
        regla_origen: ORIGIN_TEXT[rule.origin] || rule.origin,
        coincidencia,
    };
}
