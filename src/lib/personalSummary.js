// Cálculo único del resumen personal: lo usan la web (/api/summary, Inicio, Presupuestos) y el MCP.
// Son funciones puras, sin base de datos, para poder probarlas y usarlas también en el navegador.
// Todos los importes se suman en céntimos enteros y solo se pasan a euros al devolverlos.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MESES_SERIE = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// A partir de este porcentaje del presupuesto consumido, el estado pasa a «Riesgo».
export const RIESGO_PCT = 90;

// ---------- Importes ----------

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;

// Convierte un importe (número, texto o Decimal de Prisma) a céntimos enteros sin errores de coma flotante.
export function toCents(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : 0;
    const text = String(value).trim();
    const match = DECIMAL.exec(text);
    if (!match) {
        const number = Number(text);
        return Number.isFinite(number) ? Math.round(number * 100) : 0;
    }
    const [, sign, whole, fraction = ''] = match;
    let cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
    if (fraction.length > 2 && Number(fraction[2]) >= 5) cents += 1;
    return sign === '-' ? -cents : cents;
}

export function fromCents(cents) {
    return Math.round(cents) / 100;
}

function sumCents(records) {
    return records.reduce((total, record) => total + toCents(record.amount), 0);
}

// Porcentaje con un decimal; null si no hay base con la que comparar.
function pct(part, base) {
    return base ? Math.round((part / base) * 1000) / 10 : null;
}

// ---------- Fechas (AAAA-MM-DD, sin horas) ----------

export function dateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
}

// Fecha de hoy en España, que es la que manda para saber si un mes o un año está en curso.
export function madridToday(now = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parts(key) {
    return key.split('-').map(Number);
}

function lastDay(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function makeKey(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isMonthEnd(key) {
    const [y, m, d] = parts(key);
    return d === lastDay(y, m);
}

function addDays(key, days) {
    const date = new Date(`${key}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return dateKey(date);
}

function daysBetween(from, to) {
    return Math.round((new Date(`${to}T00:00:00.000Z`) - new Date(`${from}T00:00:00.000Z`)) / 86400000) + 1;
}

// Retrocede n meses. El día se ajusta al último del mes destino si no existe (31 de marzo → 28 de febrero);
// si la fecha es fin de mes, el resultado también lo es (30 de noviembre → 31 de octubre).
function monthsBack(key, n) {
    const [y, m, d] = parts(key);
    const index = y * 12 + (m - 1) - n;
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;
    const end = lastDay(year, month);
    return makeKey(year, month, isMonthEnd(key) ? end : Math.min(d, end));
}

export function monthRange(year, month) {
    return { from: makeKey(year, month, 1), to: makeKey(year, month, lastDay(year, month)) };
}

export function yearRange(year) {
    return { from: makeKey(year, 1, 1), to: makeKey(year, 12, 31) };
}

// Meses naturales que toca el periodo [from, to], como AAAA-MM.
export function monthsInRange(from, to) {
    const months = [];
    let [year, month] = parts(from);
    const [endYear, endMonth] = parts(to);
    while (year < endYear || (year === endYear && month <= endMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return months;
}

// Texto corto de un tramo de fechas: «oct 2026», «2025», «1–24 oct 2026», «1 ene–24 nov 2025».
export function rangeLabel(from, to) {
    const [fy, fm, fd] = parts(from);
    const [ty, tm, td] = parts(to);
    const wholeMonths = fd === 1 && td === lastDay(ty, tm);
    if (fy === ty) {
        if (wholeMonths && fm === 1 && tm === 12) return `${fy}`;
        if (wholeMonths && fm === tm) return `${MESES_CORTOS[fm - 1]} ${fy}`;
        if (wholeMonths) return `${MESES_CORTOS[fm - 1]}–${MESES_CORTOS[tm - 1]} ${fy}`;
        if (fm === tm) return fd === td ? `${fd} ${MESES_CORTOS[fm - 1]} ${fy}` : `${fd}–${td} ${MESES_CORTOS[fm - 1]} ${fy}`;
        return `${fd} ${MESES_CORTOS[fm - 1]}–${td} ${MESES_CORTOS[tm - 1]} ${fy}`;
    }
    return `${fd} ${MESES_CORTOS[fm - 1]} ${fy}–${td} ${MESES_CORTOS[tm - 1]} ${ty}`;
}

// Tramos que se comparan, siempre equivalentes:
// - Un mes (empieza el día 1 y acaba en ese mes): frente al mes anterior.
// - Un año (empieza el 1 de enero y acaba ese año): frente a las mismas fechas del año anterior.
// - Varios meses desde el día 1: frente a los mismos días tantos meses antes.
// - Cualquier otro tramo: frente al mismo número de días inmediatamente anterior.
// Si el periodo aún no ha terminado, los dos lados se cortan en el mismo día (hoy y su equivalente).
export function comparisonRanges({ from, to, today = madridToday() }) {
    const partial = from <= today && today < to;
    const through = partial ? today : to;
    const [fy, fm, fd] = parts(from);
    const [ty, tm] = parts(to);
    let kind;
    let previous;
    if (fd === 1 && fy === ty && fm === tm) kind = 'mes';
    else if (fd === 1 && fm === 1 && fy === ty) kind = 'anio';
    else if (fd === 1) kind = 'meses';
    else kind = 'dias';

    if (kind === 'dias') {
        const prevTo = addDays(from, -1);
        previous = { from: addDays(prevTo, -(daysBetween(from, through) - 1)), to: prevTo };
    } else {
        const shift = kind === 'anio' ? 12 : monthsInRange(from, to).length;
        previous = { from: monthsBack(from, shift), to: monthsBack(through, shift) };
    }
    const current = { from, to: through };
    const currentLabel = rangeLabel(current.from, current.to);
    const previousLabel = rangeLabel(previous.from, previous.to);
    const description = partial
        ? `Periodo en curso: se compara ${currentLabel} con ${previousLabel}, hasta el mismo día.`
        : `Se compara ${currentLabel} con ${previousLabel}.`;
    return { kind, partial, current, previous, currentLabel, previousLabel, description };
}

// Meses de presupuesto de un periodo: los meses transcurridos (contando el actual) si está en curso;
// todos si ya terminó o aún no ha empezado. Un año en curso en noviembre cuenta 11 meses; uno pasado, 12.
export function budgetMonths({ from, to, today = madridToday() }) {
    const through = from <= today && today < to ? today : to;
    return monthsInRange(from, through).length;
}

// Tramo de fechas que hay que cargar para calcular el resumen, su comparación y una serie opcional.
export function summaryLoadRange({ from, to, today = madridToday(), seriesFrom = null, seriesTo = null }) {
    const { previous } = comparisonRanges({ from, to, today });
    const starts = [from, previous.from, seriesFrom].filter(Boolean).sort();
    const ends = [to, seriesTo].filter(Boolean).sort();
    return { from: starts[0], to: ends[ends.length - 1] };
}

// ---------- Cálculos ----------

function inRange(record, from, to) {
    const key = dateKey(record.date);
    return key >= from && key <= to;
}

function totalsCents({ expenses, incomes, from, to }) {
    const income = sumCents(incomes.filter(r => inRange(r, from, to)));
    const expense = sumCents(expenses.filter(r => inRange(r, from, to)));
    return { income, expense, savings: income - expense };
}

// Ingresos, gastos y ahorro de un tramo, en euros.
export function periodTotals({ expenses = [], incomes = [], from, to }) {
    const t = totalsCents({ expenses, incomes, from, to });
    return { income: fromCents(t.income), expenses: fromCents(t.expense), savings: fromCents(t.savings) };
}

function sumByKey(records, keyFn) {
    const totals = new Map();
    for (const record of records) {
        const key = keyFn(record);
        totals.set(key, (totals.get(key) || 0) + toCents(record.amount));
    }
    return totals;
}

function categoryOf(record) {
    return record.category?.trim() || 'Sin clasificar';
}

function expenseTypeOf(record) {
    const type = record.expense_type?.trim();
    if (!type || type.toLowerCase() === 'variable') return 'Variable';
    if (type.toLowerCase() === 'fijo') return 'Fijo';
    return type;
}

// Gasto por categoría en céntimos, a partir de las filas de gasto.
export function spentByCategory(expenses) {
    return sumByKey(expenses, categoryOf);
}

// Compara el gasto con el presupuesto solo en las categorías que lo tienen (importe mensual > 0).
// El gasto de categorías sin presupuesto se informa aparte y nunca cuenta como exceso.
// spent: Map de categoría → céntimos gastados en el periodo. months: meses de presupuesto.
export function compareBudgets({ budgets = [], spent = new Map(), months = 1 }) {
    const categories = [];
    const budgeted = new Set();
    for (const item of budgets) {
        const monthly = toCents(item.monthly_amount);
        const name = item.category?.trim();
        if (!name || monthly <= 0 || budgeted.has(name)) continue;
        budgeted.add(name);
        const budget = monthly * months;
        const used = spent.get(name) || 0;
        categories.push({
            category: name,
            monthly: fromCents(monthly),
            budget: fromCents(budget),
            spent: fromCents(used),
            remaining: fromCents(budget - used),
            ratio: pct(used, budget),
            over: used > budget,
            budgetCents: budget,
            spentCents: used,
        });
    }
    categories.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) || a.category.localeCompare(b.category, 'es'));
    const total = categories.reduce((sum, c) => sum + c.budgetCents, 0);
    const used = categories.reduce((sum, c) => sum + c.spentCents, 0);
    const allSpent = [...spent.values()].reduce((sum, value) => sum + value, 0);
    const unbudgetedCategories = [...spent].filter(([name, value]) => value !== 0 && !budgeted.has(name)).map(([name]) => name);
    const ratio = pct(used, total);
    const overCategories = categories.filter(c => c.over).map(c => c.category);
    let status;
    if (!total) status = 'sin_presupuesto';
    else if (used > total) status = 'excedido';
    else if (overCategories.length || ratio >= RIESGO_PCT) status = 'riesgo';
    else status = 'en_orden';
    return {
        months,
        total: fromCents(total),
        spent: fromCents(used),
        remaining: fromCents(total - used),
        ratio,
        unbudgetedSpent: fromCents(allSpent - used),
        unbudgetedCategories,
        overCategories,
        status,
        categories: categories.map(({ budgetCents, spentCents, ...rest }) => rest),
    };
}

// Estado general para la cabecera. «Excedido» solo depende de las categorías con presupuesto.
export function financialStatus({ hasData, budget, savings, savingsRate }) {
    if (!hasData) return { level: 'neutral', label: 'Sin datos', desc: 'No hay movimientos en este periodo' };
    if (budget?.status === 'excedido') {
        return { level: 'danger', label: 'Excedido', desc: 'El gasto en las categorías con presupuesto supera lo previsto' };
    }
    if (savings < 0) return { level: 'danger', label: 'En negativo', desc: 'Gastas más de lo que ingresas' };
    if (budget?.status === 'riesgo') {
        const over = budget.overCategories?.length || 0;
        return {
            level: 'warning', label: 'Riesgo',
            desc: over ? `${over} ${over === 1 ? 'categoría supera' : 'categorías superan'} su presupuesto` : 'Cerca del límite del presupuesto',
        };
    }
    if (savingsRate !== null && savingsRate !== undefined && savingsRate < 10) {
        return { level: 'warning', label: 'Ahorro bajo', desc: 'Ahorras menos del 10 % de tus ingresos' };
    }
    return {
        level: 'success', label: 'Bajo control',
        desc: budget?.status === 'en_orden' ? 'Dentro del presupuesto y con ahorro' : 'Ingresas más de lo que gastas',
    };
}

// Resumen completo de un periodo [from, to].
// expenses/incomes deben cubrir summaryLoadRange(): el periodo, el tramo de comparación y la serie, si se pide.
// La serie mensual cubre [seriesFrom, seriesTo] (por defecto, el propio periodo).
export function computePersonalSummary({
    expenses = [], incomes = [], budgets = [], from, to, today = madridToday(),
    seriesFrom = null, seriesTo = null, topLimit = 10,
}) {
    const periodExpenses = expenses.filter(r => inRange(r, from, to));
    const periodIncomes = incomes.filter(r => inRange(r, from, to));
    const totals = totalsCents({ expenses: periodExpenses, incomes: periodIncomes, from, to });
    const months = monthsInRange(from, to);

    const comparison = comparisonRanges({ from, to, today });
    const cur = totalsCents({ expenses, incomes, ...comparison.current });
    const prev = totalsCents({ expenses, incomes, ...comparison.previous });

    const spent = spentByCategory(periodExpenses);
    const budget = compareBudgets({ budgets, spent, months: budgetMonths({ from, to, today }) });
    const budgetByCategory = new Map(budget.categories.map(c => [c.category, c]));

    const names = new Set([...spent.keys(), ...budgetByCategory.keys()]);
    const byCategory = [...names].map(category => {
        const used = spent.get(category) || 0;
        const row = budgetByCategory.get(category);
        const limit = row ? toCents(row.budget) : null;
        return {
            category,
            spent: fromCents(used),
            budget: limit === null ? null : fromCents(limit),
            deviation: limit === null ? null : fromCents(used - limit),
            deviationPct: limit === null ? null : pct(used - limit, limit),
            sharePct: pct(used, totals.expense) ?? 0,
        };
    }).sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category, 'es'));

    const sortedAmounts = map => [...map].map(([name, cents]) => ({ name, amount: fromCents(cents) }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'));

    const series = { from: seriesFrom || from, to: seriesTo || to };
    const seriesMonths = monthsInRange(series.from, series.to);
    const monthOf = r => dateKey(r.date).slice(0, 7);
    const seriesIncome = sumByKey(incomes.filter(r => inRange(r, series.from, series.to)), monthOf);
    const seriesExpense = sumByKey(expenses.filter(r => inRange(r, series.from, series.to)), monthOf);
    const monthly = seriesMonths.map(month => {
        const inc = seriesIncome.get(month) || 0;
        const exp = seriesExpense.get(month) || 0;
        return { month, income: fromCents(inc), expenses: fromCents(exp), savings: fromCents(inc - exp) };
    });

    return {
        period: { from, to, months: months.length, partial: comparison.partial, through: comparison.current.to },
        hasData: periodExpenses.length + periodIncomes.length > 0,
        totals: {
            income: fromCents(totals.income),
            expenses: fromCents(totals.expense),
            savings: fromCents(totals.savings),
            savingsRate: pct(totals.savings, totals.income),
        },
        budget,
        byCategory,
        incomeByCategory: sortedAmounts(sumByKey(periodIncomes, categoryOf)),
        byType: sortedAmounts(sumByKey(periodExpenses, expenseTypeOf)),
        monthly,
        topExpenses: [...periodExpenses].sort((a, b) => toCents(b.amount) - toCents(a.amount)).slice(0, topLimit)
            .map(r => ({
                id: r.id, date: dateKey(r.date), amount: fromCents(toCents(r.amount)),
                category: r.category, subcategory: r.subcategory ?? null, notes: r.notes ?? null,
            })),
        comparison: {
            kind: comparison.kind,
            partial: comparison.partial,
            description: comparison.description,
            currentLabel: comparison.currentLabel,
            previousLabel: comparison.previousLabel,
            current: { ...comparison.current, income: fromCents(cur.income), expenses: fromCents(cur.expense), savings: fromCents(cur.savings) },
            previous: { ...comparison.previous, income: fromCents(prev.income), expenses: fromCents(prev.expense), savings: fromCents(prev.savings) },
            change: {
                incomePct: pct(cur.income - prev.income, prev.income),
                expensesPct: pct(cur.expense - prev.expense, prev.expense),
                savings: fromCents(cur.savings - prev.savings),
                savingsPct: pct(cur.savings - prev.savings, Math.abs(prev.savings)),
            },
        },
    };
}

// Serie de 12 meses de un año en el formato que pinta la web.
export function yearSeries(monthly, year) {
    const byMonth = new Map(monthly.map(m => [m.month, m]));
    return MESES_SERIE.map((name, index) => {
        const row = byMonth.get(`${year}-${String(index + 1).padStart(2, '0')}`);
        return { month: index, name, income: row?.income ?? 0, expenses: row?.expenses ?? 0, savings: row?.savings ?? 0 };
    });
}
