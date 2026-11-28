const MAX_CENTS = 99_999_999_999_999;
// Importe decimal con hasta dos decimales, con punto o coma: «12», «12.5», «-12,30», «+500».
const AMOUNT_TEXT = /^[+-]?\d+(?:[.,]\d{1,2})?$/;
// Porcentaje con hasta dos decimales: «21», «5,2», «10.5».
const PERCENT_TEXT = /^\d{1,3}(?:[.,]\d{1,2})?$/;
const VAT_PERIOD = /^\d{4}-Q[1-4]$/;
const VAT_TREATMENTS = ['DOMESTIC', 'EXEMPT', 'NON_SUBJECT'];
// Tipos de flujo de un movimiento de dinero de empresa (los traspasos aparte, con TRANSFER).
export const FLOW_TYPES = ['OPERATING', 'INVESTING', 'FINANCING', 'TAX', 'OTHER'];

// Texto decimal de un importe. Solo acepta números finitos, textos y Decimal de Prisma (valores ya
// guardados); cualquier otra cosa (true, [5], {}, null) no es un importe.
function decimalText(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && typeof value.toFixed === 'function' && typeof value.isFinite === 'function') {
        return value.isFinite() ? value.toFixed() : null;
    }
    return null;
}

// Convierte un importe en céntimos sin pasar por coma flotante. Devuelve null si no es válido:
// rechaza «0x1F», «1e3», «12.345», booleanos, listas y textos vacíos.
export function cents(value, { allowNegative = false, allowZero = false } = {}) {
    const text = decimalText(value);
    if (text === null || !AMOUNT_TEXT.test(text)) return null;
    const sign = text.startsWith('-') ? -1 : 1;
    const [whole, fraction = ''] = text.replace(/^[+-]/, '').split(/[.,]/);
    const result = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_CENTS) return null;
    if ((!allowNegative && result < 0) || (!allowZero && result === 0)) return null;
    return result === 0 ? 0 : result;
}

// Porcentaje entre 0 y 100 con hasta dos decimales, o null si no es válido.
export function percent(value) {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
    if (!PERCENT_TEXT.test(text)) return null;
    const number = Number(text.replace(',', '.'));
    return number <= 100 ? number : null;
}

const missing = value => value === undefined || value === null || value === '';

export function money(value) {
    return (value / 100).toFixed(2);
}

export function appDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function dateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
}

export function todayInMadrid() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function quarter(value) {
    const date = appDate(value);
    return date ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}` : null;
}

export function cleanText(value, max, required = false) {
    if (value == null || value === '') return required ? null : '';
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return (!text && required) || text.length > max ? null : text;
}

export function activityInput(input) {
    if (!input || !['INCOME', 'EXPENSE'].includes(input.direction)) return { error: 'Tipo de operación inválido' };
    const description = cleanText(input.description, 240, true);
    const category = cleanText(input.category, 100, true);
    const occurred_on = appDate(input.occurred_on);
    const due_on = input.due_on ? appDate(input.due_on) : null;
    if (!description || !category || !occurred_on || (input.due_on && !due_on)) return { error: 'Completa concepto, categoría y fechas válidas' };
    if (input.occurred_on > todayInMadrid()) return { error: 'Un ingreso o gasto futuro debe registrarse como previsión' };
    if (due_on && due_on < occurred_on) return { error: 'El vencimiento no puede ser anterior al devengo' };

    const document_kind = input.document_kind || 'NONE';
    if (!['NONE', 'INVOICE'].includes(document_kind)) return { error: 'Tipo de documento inválido' };
    const document_number = cleanText(input.document_number, 80);
    const document_date = input.document_date ? appDate(input.document_date) : null;
    const counterparty_name = cleanText(input.counterparty_name, 160);
    const counterparty_tax_id = cleanText(input.counterparty_tax_id, 32);
    if ([document_number, counterparty_name, counterparty_tax_id].includes(null) || (input.document_date && !document_date) || (input.document_date && input.document_date > todayInMadrid())) return { error: 'Datos del documento inválidos' };
    if (document_kind !== 'NONE' && (!document_number || !document_date || !counterparty_name)) return { error: 'La factura necesita número, fecha y contraparte' };
    if (document_kind === 'NONE' && (document_number || document_date)) return { error: 'Indica el tipo de documento para registrar una factura' };

    const rawLines = input.tax_lines;
    if (!Array.isArray(rawLines) || rawLines.length < 1 || rawLines.length > 20) return { error: 'Añade entre 1 y 20 líneas de importes' };
    let base = 0, vat = 0, deductible = 0;
    const tax_lines = [];
    for (const [index, line] of rawLines.entries()) {
        const where = rawLines.length > 1 ? ` de la línea ${index + 1}` : '';
        if (!line || typeof line !== 'object' || Array.isArray(line)) return { error: `La línea de importes ${index + 1} no es válida` };
        const baseCents = cents(line.base);
        if (baseCents === null) return { error: `Base imponible${where} inválida: indica un importe mayor que 0 con hasta dos decimales` };
        const treatment = line.vat_treatment || 'DOMESTIC';
        if (!VAT_TREATMENTS.includes(treatment)) return { error: `Clasificación de IVA${where} inválida` };
        // Sin tipo indicado solo se admite el 0 % cuando no puede ser otro: exenta, no sujeta o sin factura.
        const rate = missing(line.vat_rate) && (treatment !== 'DOMESTIC' || document_kind === 'NONE') ? 0 : percent(line.vat_rate);
        if (rate === null) return { error: `Tipo de IVA${where} inválido: indica un porcentaje entre 0 y 100 con hasta dos decimales` };
        if (treatment !== 'DOMESTIC' && rate !== 0) return { error: `Una línea exenta o no sujeta lleva el IVA al 0 %${where ? ` (línea ${index + 1})` : ''}` };
        const deduction = input.direction === 'EXPENSE' ? (missing(line.deductible_percent) ? 100 : percent(line.deductible_percent)) : 0;
        if (deduction === null) return { error: `IVA deducible${where} inválido: indica un porcentaje entre 0 y 100 con hasta dos decimales` };
        const vatCents = Math.round(baseCents * rate / 100);
        const deductibleCents = Math.round(vatCents * deduction / 100);
        base += baseCents;
        vat += vatCents;
        deductible += deductibleCents;
        tax_lines.push({ base: money(baseCents), vat_treatment: treatment, vat_rate: rate, vat_amount: money(vatCents), deductible_percent: deduction, deductible_vat: money(deductibleCents) });
    }
    const withholdingRate = missing(input.withholding_rate) ? 0 : percent(input.withholding_rate);
    if (withholdingRate === null) return { error: 'Retención inválida: indica un porcentaje entre 0 y 100 con hasta dos decimales' };
    const withholding = Math.round(base * withholdingRate / 100);
    const total = base + vat - withholding;
    if (total <= 0 || [base, vat, deductible, withholding, total].some(amount => amount > MAX_CENTS)) return { error: 'Total inválido' };

    let vat_period = null;
    if (document_kind !== 'NONE') {
        const documentQuarter = quarter(dateKey(document_date));
        vat_period = missing(input.vat_period) ? documentQuarter : typeof input.vat_period === 'string' ? input.vat_period.trim() : null;
        if (!VAT_PERIOD.test(vat_period || '')) return { error: 'Período de IVA inválido: usa el formato AAAA-QN, por ejemplo 2026-Q4' };
        // Una factura puede declararse en un trimestre posterior a su fecha, nunca en uno anterior.
        if (vat_period < documentQuarter) return { error: `El período de IVA ${vat_period} es anterior al trimestre de la fecha de factura (${documentQuarter})` };
    } else if (vat !== 0) {
        return { error: 'Sin factura, registra la base con IVA al 0 % hasta disponer del documento' };
    }
    return { value: {
        direction: input.direction, description, category, occurred_on, due_on,
        counterparty_name: counterparty_name || null, counterparty_tax_id: counterparty_tax_id || null,
        document_kind, document_number: document_number || null, document_date,
        vat_period, tax_lines, base_amount: money(base), vat_amount: money(vat),
        deductible_vat: money(deductible), withholding_amount: money(withholding), total_amount: money(total)
    } };
}

export function outstanding(activity) {
    const paid = (activity.allocations || []).reduce((sum, allocation) => sum + (cents(allocation.amount, { allowZero: true }) || 0), 0);
    return Math.max(0, (cents(activity.total_amount) || 0) - paid);
}

// Fecha en la que se espera cobrar o pagar un pendiente: su vencimiento o, si no tiene, la fecha de
// devengo (se considera exigible desde entonces y cuenta ya en la previsión).
export function expectedOn(activity) {
    return activity.due_on || activity.occurred_on;
}

// Un trimestre de IVA está cerrado cuando terminó antes del trimestre actual: puede estar ya declarado.
export function isClosedQuarter(period, today = todayInMadrid()) {
    return typeof period === 'string' && VAT_PERIOD.test(period) && period < quarter(dateKey(today));
}

// Datos de una operación que cuentan para la declaración de IVA. Concepto, categoría y vencimiento no.
function fiscalFingerprint(activity) {
    const day = value => (value ? dateKey(value) : null);
    const amount = value => cents(value, { allowZero: true });
    const lines = Array.isArray(activity.tax_lines) ? activity.tax_lines : [];
    return JSON.stringify([
        activity.direction, day(activity.occurred_on), activity.document_kind || 'NONE', activity.document_number || null, day(activity.document_date),
        activity.counterparty_name || null, activity.counterparty_tax_id || null, activity.vat_period || null,
        ...['base_amount', 'vat_amount', 'deductible_vat', 'withholding_amount', 'total_amount'].map(key => amount(activity[key])),
        lines.map(line => [amount(line?.base), line?.vat_treatment || 'DOMESTIC', Number(line?.vat_rate), amount(line?.vat_amount), Number(line?.deductible_percent ?? 0), amount(line?.deductible_vat)]),
    ]);
}

// Trimestres de IVA ya cerrados que cambiaría editar una factura (con `next`) o borrarla (sin `next`).
// Una edición que solo toca concepto, categoría o vencimiento no cambia ningún trimestre.
export function closedQuartersTouched(existing, next = null, today = todayInMadrid()) {
    const periods = [existing, next]
        .filter(item => item && item.document_kind && item.document_kind !== 'NONE')
        .map(item => item.vat_period)
        .filter(period => isClosedQuarter(period, today));
    if (!periods.length || (next && fiscalFingerprint(existing) === fiscalFingerprint(next))) return [];
    return [...new Set(periods)].sort();
}

// Explicación común para la web y el MCP. `action` es 'editar' o 'borrar'.
export function closedQuarterMessage(periods, action) {
    const plural = periods.length > 1;
    const list = plural ? `los trimestres de IVA ${periods.join(' y ')}` : `el trimestre de IVA ${periods[0]}`;
    return `Esta factura afecta a ${list}, que ya ${plural ? 'han terminado y pueden estar declarados' : 'ha terminado y puede estar declarado'}. ` +
        `${action === 'borrar' ? 'Borrarla' : 'Guardar el cambio'} modifica ${plural ? 'esos trimestres' : 'ese trimestre'}: si ya ${plural ? 'los' : 'lo'} presentaste, puede que necesites una declaración complementaria o sustitutiva.`;
}

export function summarizeBusiness({ accounts, activities, movements, plans }, today = todayInMadrid()) {
    const current = dateKey(today);
    const month = current.slice(0, 7);
    const accountBalances = accounts.map(account => {
        const opening = cents(account.opening_balance, { allowNegative: true, allowZero: true }) || 0;
        const movementTotal = movements.filter(m => m.account_id === account.id && dateKey(m.date) <= current).reduce((sum, m) => sum + (cents(m.amount, { allowNegative: true, allowZero: true }) || 0), 0);
        return { id: account.id, name: account.name, balance: money(opening + movementTotal) };
    });
    const liquid = accountBalances.reduce((sum, account) => sum + cents(account.balance, { allowNegative: true, allowZero: true }), 0);
    const accrued = { income: 0, expense: 0 };
    const pending = { income: 0, expense: 0, overdue: 0 };
    for (const activity of activities) {
        const amount = (cents(activity.base_amount, { allowZero: true }) || 0) + (activity.direction === 'EXPENSE' ?
            (cents(activity.vat_amount, { allowZero: true }) || 0) - (cents(activity.deductible_vat, { allowZero: true }) || 0) : 0);
        if (dateKey(activity.occurred_on).slice(0, 7) === month) accrued[activity.direction.toLowerCase()] += amount;
        const open = outstanding(activity);
        pending[activity.direction.toLowerCase()] += open;
        if (open > 0 && dateKey(expectedOn(activity)) < current) pending.overdue += open;
    }
    const monthMovements = movements.filter(m => dateKey(m.date) <= current && dateKey(m.date).slice(0, 7) === month && m.flow_type !== 'TRANSFER');
    const monthFlow = monthMovements.reduce((sum, m) => sum + (cents(m.amount, { allowNegative: true, allowZero: true }) || 0), 0);
    const vatPeriod = quarter(current);
    const vat = { output: 0, deductible: 0 };
    for (const activity of activities.filter(a => a.vat_period === vatPeriod && a.document_kind !== 'NONE')) {
        if (activity.direction === 'INCOME') vat.output += cents(activity.vat_amount, { allowZero: true }) || 0;
        else vat.deductible += cents(activity.deductible_vat, { allowZero: true }) || 0;
    }
    const project = days => {
        const end = new Date(`${current}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + days);
        const endKey = dateKey(end);
        const due = activities.reduce((sum, activity) => {
            const open = outstanding(activity);
            // Sin vencimiento cuenta desde la fecha de devengo: si ya pasó, desde hoy.
            if (!open || dateKey(expectedOn(activity)) > endKey) return sum;
            return sum + (activity.direction === 'INCOME' ? open : -open);
        }, 0);
        const planned = plans.filter(p => p.status === 'PLANNED' && dateKey(p.due_on) <= endKey).reduce((sum, p) => {
            const amount = cents(p.amount) || 0;
            return sum + (p.direction === 'INCOME' ? amount : -amount);
        }, 0);
        return money(liquid + due + planned);
    };
    return {
        accountBalances,
        liquid: money(liquid),
        accrued: { income: money(accrued.income), expense: money(accrued.expense), result: money(accrued.income - accrued.expense) },
        pending: { income: money(pending.income), expense: money(pending.expense), overdue: money(pending.overdue) },
        monthFlow: money(monthFlow),
        projected30: project(30), projected90: project(90),
        vat: { period: vatPeriod, output: money(vat.output), deductible: money(vat.deductible), difference: money(vat.output - vat.deductible) }
    };
}
