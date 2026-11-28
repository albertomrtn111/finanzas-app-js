// Utilidades generales de la interfaz
import { formatEuro } from './moneyFormat.js';
import { parseAmountInput } from './amount.js';

/**
 * Formatea un número como moneda (euros). Se mantiene por compatibilidad con los gráficos;
 * en código nuevo usa formatEuro (src/lib/moneyFormat.js) o el componente Money.
 */
export function formatCurrency(amount) {
    return formatEuro(amount);
}

/**
 * Formatea un porcentaje
 */
export function formatPercent(value, decimals = 1) {
    return `${value.toFixed(decimals)}%`;
}

const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

// Meses para un desplegable: [{ value: 1, label: 'Enero' }, …, { value: 12, label: 'Diciembre' }].
export function monthOptions() {
    return Array.from({ length: 12 }, (_, index) => {
        const name = monthFormat.format(new Date(Date.UTC(2026, index, 1)));
        return { value: index + 1, label: name.charAt(0).toUpperCase() + name.slice(1) };
    });
}

// Petición JSON a la API. Si falla, lanza un Error con el mensaje del servidor en español
// (o uno genérico) y el estado HTTP en error.status.
export async function requestJson(url, options) {
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new Error('No hay conexión con el servidor. Comprueba tu conexión y vuelve a intentarlo.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data?.error || `El servidor ha respondido con un error (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return data;
}

// Opciones de fetch para enviar JSON: fetch(url, jsonRequest('POST', datos)).
export function jsonRequest(method, body) {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Variación de cada registro respecto al anterior de la misma cuenta (de un día anterior).
// Devuelve un Map id → diferencia; los registros sin anterior no aparecen. O(n log n).
export function changeFromPrevious(records, { group = 'account', value = 'current_value' } = {}) {
    const groups = new Map();
    for (const record of records) {
        const time = new Date(record.date).getTime();
        if (!Number.isFinite(time)) continue;
        const list = groups.get(record[group]) || [];
        list.push({ record, time });
        groups.set(record[group], list);
    }
    const changes = new Map();
    for (const list of groups.values()) {
        list.sort((a, b) => a.time - b.time);
        let previous = null;
        let last = null;
        for (const item of list) {
            if (last && last.time < item.time) previous = last;
            if (previous) changes.set(item.record.id, Number(item.record[value]) - Number(previous.record[value]));
            last = item;
        }
    }
    return changes;
}

// Presupuestos tal como se escriben en el formulario ({ categoría: '120,50' }).
// Un campo vacío cuenta como 0. Devuelve { budgets: [{ category, monthly_amount }], errors: { categoría: mensaje } }.
export function parseBudgetInputs(inputs) {
    const budgets = [];
    const errors = {};
    for (const [category, text] of Object.entries(inputs)) {
        if (!String(text ?? '').trim()) {
            budgets.push({ category, monthly_amount: '0.00' });
            continue;
        }
        const { value, error } = parseAmountInput(text, { allowZero: true, label: 'El presupuesto' });
        if (error) errors[category] = error;
        else budgets.push({ category, monthly_amount: value });
    }
    return { budgets, errors };
}
