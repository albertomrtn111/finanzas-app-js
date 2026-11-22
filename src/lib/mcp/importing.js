// Reglas puras de la importación de extractos y capturas: normalizar conceptos,
// detectar duplicados y sugerir la clasificación a partir del historial.

// Palabras que los bancos añaden a casi todos los conceptos y no identifican al comercio.
const NOISE = new Set([
    'compra', 'compras', 'tarj', 'tarjeta', 'tarjetas', 'card', 'pago', 'pagos', 'recibo', 'recibos', 'adeudo', 'cargo',
    'abono', 'transferencia', 'transf', 'trf', 'inmediata', 'emitida', 'recibida', 'favor', 'de', 'del', 'en', 'la', 'el',
    'los', 'las', 'a', 'y', 'por', 'con', 'sl', 'sa', 'slu', 'www', 'com', 'es', 'contactless', 'visa', 'mastercard',
    'debito', 'credito', 'operacion', 'op', 'ref', 'concepto', 'fecha', 'num', 'n', 'nº', 'apple', 'google', 'pay',
]);

export function normalizeConcept(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ') // fechas
        .replace(/[x*]{3,}\d*/g, ' ') // tarjetas enmascaradas
        .replace(/[^a-z0-9ñ ]+/g, ' ')
        .replace(/\b\d+\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function conceptTokens(text) {
    return [...new Set(normalizeConcept(text).split(' ').filter(token => token.length > 1 && !NOISE.has(token)))];
}

// Clave corta del comercio o contraparte: las dos primeras palabras significativas.
export function merchantKey(text) {
    return conceptTokens(text).slice(0, 2).join(' ');
}

export function similarity(a, b) {
    const left = new Set(conceptTokens(a));
    const right = new Set(conceptTokens(b));
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const token of left) if (right.has(token)) shared += 1;
    return shared / Math.min(left.size, right.size);
}

const DAY = 24 * 60 * 60 * 1000;

function dayDiff(a, b) {
    return Math.round(Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / DAY);
}

// Un registro existente o una fila del lote: { fecha, centimos (con signo), concepto }.
// «seguro»: mismo importe, como mucho un día de diferencia y concepto parecido (o sin concepto con que comparar).
// «posible»: mismo importe y hasta 3 días de diferencia.
export function duplicateLevel(row, candidate) {
    if (row.centimos !== candidate.centimos) return null;
    const days = dayDiff(row.fecha, candidate.fecha);
    if (days > 3) return null;
    const hasText = conceptTokens(row.concepto).length && conceptTokens(candidate.concepto).length;
    const score = hasText ? similarity(row.concepto, candidate.concepto) : null;
    if (days <= 1 && (score === null || score >= 0.5)) return 'seguro';
    if (score !== null && score === 0 && days > 0) return null;
    return 'posible';
}

export function findDuplicates(row, candidates, limit = 3) {
    const found = [];
    for (const candidate of candidates) {
        const nivel = duplicateLevel(row, candidate);
        if (nivel) found.push({ nivel, ...candidate.ref, fecha: candidate.fecha, importe: candidate.centimos / 100, concepto: candidate.concepto });
    }
    found.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'seguro' ? -1 : 1));
    return found.slice(0, limit);
}

// Duplicados dentro del propio lote (p. ej., dos capturas que se solapan). Devuelve, por fila, el índice de la primera igual.
export function batchRepeats(rows) {
    const seen = new Map();
    return rows.map((row, index) => {
        const key = `${row.fecha}|${row.centimos}|${normalizeConcept(row.concepto)}`;
        if (seen.has(key)) return seen.get(key);
        seen.set(key, index);
        return null;
    });
}

// Índice del historial: clave del comercio → clasificaciones usadas y cuántas veces.
// Cada ejemplo: { concepto, clasificacion (objeto), peso }.
export function buildHistory(examples) {
    const index = new Map();
    for (const example of examples) {
        const key = merchantKey(example.concepto);
        if (!key) continue;
        const bucket = index.get(key) || new Map();
        const id = JSON.stringify(example.clasificacion);
        const entry = bucket.get(id) || { clasificacion: example.clasificacion, veces: 0, ejemplo: example.concepto };
        entry.veces += example.peso ?? 1;
        bucket.set(id, entry);
        index.set(key, bucket);
    }
    return index;
}

// Sugerencia para un concepto según el historial. Solo propone clasificaciones del mismo sentido (entrada o salida).
export function suggest(history, concepto, direction) {
    const key = merchantKey(concepto);
    if (!key) return null;
    let bucket = history.get(key);
    if (!bucket) {
        const first = key.split(' ')[0];
        if (first.length >= 4) {
            for (const [other, entries] of history) {
                if (other.split(' ')[0] === first) { bucket = entries; break; }
            }
        }
    }
    if (!bucket) return null;
    const options = [...bucket.values()].filter(entry => entry.clasificacion.sentido === direction);
    if (!options.length) return null;
    const total = options.reduce((sum, entry) => sum + entry.veces, 0);
    options.sort((a, b) => b.veces - a.veces);
    const best = options[0];
    const { sentido: _sentido, ...clasificacion } = best.clasificacion;
    return {
        ...clasificacion,
        confianza: Math.round((best.veces / total) * 100) / 100,
        veces: best.veces,
        parecido_a: best.ejemplo,
        alternativas: options.slice(1, 3).map(entry => {
            const { sentido: _s, ...rest } = entry.clasificacion;
            return { ...rest, veces: entry.veces };
        }),
    };
}
