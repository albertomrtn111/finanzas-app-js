const MAX_CENTS = 99_999_999_999_999;

export function cents(value, { allowNegative = false, allowZero = false } = {}) {
    const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const number = Number(normalized);
    if (!Number.isFinite(number) || (!allowNegative && number < 0) || (!allowZero && number === 0)) return null;
    const result = Math.round(number * 100);
    if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_CENTS || Math.abs(result / 100 - number) > 0.000001) return null;
    return result;
}

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
    for (const line of rawLines) {
        const baseCents = cents(line?.base);
        const rate = Number(line?.vat_rate);
        const treatment = line?.vat_treatment || 'DOMESTIC';
        const deduction = input.direction === 'EXPENSE' ? Number(line?.deductible_percent ?? 100) : 0;
        if (baseCents === null || baseCents <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 100 ||
            !Number.isFinite(deduction) || deduction < 0 || deduction > 100 ||
            !['DOMESTIC', 'EXEMPT', 'NON_SUBJECT'].includes(treatment) || (treatment !== 'DOMESTIC' && rate !== 0)) return { error: 'Importes o clasificación de IVA inválidos' };
        const vatCents = Math.round(baseCents * rate / 100);
        const deductibleCents = Math.round(vatCents * deduction / 100);
        base += baseCents;
        vat += vatCents;
        deductible += deductibleCents;
        tax_lines.push({ base: money(baseCents), vat_treatment: treatment, vat_rate: rate, vat_amount: money(vatCents), deductible_percent: deduction, deductible_vat: money(deductibleCents) });
    }
    const withholdingRate = Number(input.withholding_rate || 0);
    if (!Number.isFinite(withholdingRate) || withholdingRate < 0 || withholdingRate > 100) return { error: 'Retención inválida' };
    const withholding = Math.round(base * withholdingRate / 100);
    const total = base + vat - withholding;
    if (total <= 0 || [base, vat, deductible, withholding, total].some(amount => amount > MAX_CENTS)) return { error: 'Total inválido' };

    let vat_period = null;
    if (document_kind !== 'NONE') {
        vat_period = input.vat_period || quarter(dateKey(document_date));
        if (!/^\d{4}-Q[1-4]$/.test(vat_period)) return { error: 'Período de IVA inválido' };
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
    const paid = (activity.allocations || []).reduce((sum, allocation) => sum + cents(allocation.amount, { allowZero: true }), 0);
    return Math.max(0, cents(activity.total_amount) - paid);
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
        if (open > 0 && activity.due_on && dateKey(activity.due_on) < current) pending.overdue += open;
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
            if (!open || !activity.due_on || dateKey(activity.due_on) > endKey) return sum;
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
