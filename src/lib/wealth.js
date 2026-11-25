// Patrimonio e inversiones a partir de los registros de efectivo e inversión (Tarea NF-20).
// Funciones puras, sin base de datos: las usan las páginas Patrimonio e Inversiones › Resumen.
// Todo se suma en céntimos enteros; solo las funciones build*View pasan a euros para pintar.
//
// Semántica de los datos, la misma que ver_patrimonio del MCP (src/lib/mcp/analysis.js):
// - Un registro de efectivo es el saldo de una cuenta en una fecha.
// - Un registro de inversión trae `current_value`, el valor TOTAL del producto en esa fecha, y
//   `contribution`, lo aportado EN ESE registro: positivo si se aporta, negativo si se retira y 0 si
//   solo se actualiza el valor. No es un acumulado.
// - Capital aportado de un producto = suma de sus aportaciones hasta la fecha (neto de retiradas).
// - Valor de un producto = el de su último registro hasta la fecha (a igual fecha, el de mayor id).
// - Plusvalía = valor − capital aportado. Rentabilidad = plusvalía / capital aportado, solo si este es
//   positivo (con el capital ya recuperado o en cero no tiene sentido como porcentaje).
// - Los registros con fecha posterior a «hoy» no cuentan hasta que llegue su fecha.
import { dateKey, fromCents, toCents } from './personalSummary.js';

const KEY = /^\d{4}-\d{2}-\d{2}$/;

function safeKey(value) {
    if (value === null || value === undefined || value === '') return null;
    try {
        const key = dateKey(value);
        return KEY.test(key) ? key : null;
    } catch {
        return null;
    }
}

// Filas limpias y ordenadas por fecha e id. Descarta las que no tienen cuenta o fecha válida.
export function normalizeRecords(records = []) {
    const rows = [];
    for (const record of records) {
        const account = typeof record?.account === 'string' ? record.account.trim() : '';
        const date = safeKey(record?.date);
        if (!account || !date) continue;
        rows.push({
            id: Number(record.id) || 0,
            account,
            date,
            assetType: record.asset_type?.trim() || 'Sin tipo',
            valueCents: toCents(record.current_value),
            contributionCents: toCents(record.contribution),
        });
    }
    return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

// Porcentaje con un decimal; null si no hay base.
export function pct(part, base) {
    return base ? Math.round((part / base) * 1000) / 10 : null;
}

export function returnPct(gainCents, contributedCents) {
    return contributedCents > 0 ? pct(gainCents, contributedCents) : null;
}

// Estado acumulado cuenta a cuenta, para recorrer las filas una sola vez.
function createLedger() {
    const latest = new Map();
    const contributed = new Map();
    return {
        latest,
        contributed,
        apply(row) {
            latest.set(row.account, row);
            contributed.set(row.account, (contributed.get(row.account) || 0) + row.contributionCents);
        },
        totalValue() {
            let total = 0;
            for (const row of latest.values()) total += row.valueCents;
            return total;
        },
        totalContributed() {
            let total = 0;
            for (const account of latest.keys()) total += contributed.get(account) || 0;
            return total;
        },
    };
}

function ledgerThrough(rows, through) {
    const ledger = createLedger();
    for (const row of rows) {
        if (row.date > through) break;
        ledger.apply(row);
    }
    return ledger;
}

// Patrimonio a una fecha, en céntimos. cash e investments son las filas tal cual salen de la base de datos.
export function wealthAt({ cash = [], investments = [], through }) {
    const cashLedger = ledgerThrough(normalizeRecords(cash), through);
    const invLedger = ledgerThrough(normalizeRecords(investments), through);

    const cashAccounts = [...cashLedger.latest.values()]
        .map(row => ({ account: row.account, valueCents: row.valueCents, date: row.date }))
        .sort((a, b) => b.valueCents - a.valueCents || a.account.localeCompare(b.account, 'es'));

    const products = [...invLedger.latest.values()].map(row => {
        const contributedCents = invLedger.contributed.get(row.account) || 0;
        const gainCents = row.valueCents - contributedCents;
        return {
            account: row.account,
            assetType: row.assetType,
            valueCents: row.valueCents,
            contributedCents,
            gainCents,
            returnPct: returnPct(gainCents, contributedCents),
            date: row.date,
        };
    }).sort((a, b) => b.valueCents - a.valueCents || a.account.localeCompare(b.account, 'es'));

    const byType = new Map();
    for (const product of products) byType.set(product.assetType, (byType.get(product.assetType) || 0) + product.valueCents);

    const cashCents = cashLedger.totalValue();
    const investedCents = invLedger.totalValue();
    const contributedCents = invLedger.totalContributed();
    return {
        through,
        cashCents,
        investedCents,
        contributedCents,
        gainCents: investedCents - contributedCents,
        totalCents: cashCents + investedCents,
        cashAccounts,
        products,
        byAssetType: [...byType].map(([assetType, valueCents]) => ({ assetType, valueCents }))
            .sort((a, b) => b.valueCents - a.valueCents || a.assetType.localeCompare(b.assetType, 'es')),
    };
}

// ---------- Fechas de la serie ----------

function lastDayKey(month) {
    const [year, m] = month.split('-').map(Number);
    const day = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return `${month}-${String(day).padStart(2, '0')}`;
}

function addMonths(month, n) {
    const [year, m] = month.split('-').map(Number);
    const index = year * 12 + (m - 1) + n;
    const y = Math.floor(index / 12);
    return `${y}-${String(index - y * 12 + 1).padStart(2, '0')}`;
}

export function monthsBetween(fromMonth, toMonth) {
    const list = [];
    for (let month = fromMonth; month <= toMonth; month = addMonths(month, 1)) list.push(month);
    return list;
}

// Primera fecha con datos (efectivo o inversión) hasta `through`, o null.
export function firstRecordDate({ cash = [], investments = [], through = null }) {
    let first = null;
    for (const row of [...normalizeRecords(cash), ...normalizeRecords(investments)]) {
        if (through && row.date > through) continue;
        if (!first || row.date < first) first = row.date;
    }
    return first;
}

// Serie mensual del patrimonio, en céntimos: un punto por fin de mes y el último en `through` (hoy).
// Entre dos registros de una cuenta se arrastra su último valor, así que los meses sin datos no caen a 0.
// months: número máximo de puntos (12 = último año); null = desde el primer mes con datos.
// La serie nunca empieza antes del primer mes con datos.
export function monthlyWealthSeries({ cash = [], investments = [], through, months = null }) {
    const cashRows = normalizeRecords(cash);
    const invRows = normalizeRecords(investments);
    const first = firstRecordDate({ cash, investments, through });
    if (!first) return [];

    const lastMonth = through.slice(0, 7);
    let startMonth = first.slice(0, 7);
    if (months) {
        const windowStart = addMonths(lastMonth, -(months - 1));
        if (windowStart > startMonth) startMonth = windowStart;
    }

    const cashLedger = createLedger();
    const invLedger = createLedger();
    let ci = 0;
    let ii = 0;
    return monthsBetween(startMonth, lastMonth).map(month => {
        const date = month === lastMonth ? through : lastDayKey(month);
        while (ci < cashRows.length && cashRows[ci].date <= date) cashLedger.apply(cashRows[ci++]);
        while (ii < invRows.length && invRows[ii].date <= date) invLedger.apply(invRows[ii++]);
        const cashCents = cashLedger.totalValue();
        const investedCents = invLedger.totalValue();
        return {
            month,
            date,
            cashCents,
            investedCents,
            contributedCents: invLedger.totalContributed(),
            totalCents: cashCents + investedCents,
        };
    });
}

// ---------- Vistas para las páginas (euros) ----------

export const WINDOW_OPTIONS = [
    { value: '12', months: 12, label: '1 año' },
    { value: '36', months: 36, label: '3 años' },
    { value: 'todo', months: null, label: 'Todo' },
];

// Ventana de la evolución desde ?meses=…: 12 por defecto, «todo» o un número de 1 a 240.
export function parseWindow(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === 'todo') return { value: 'todo', months: null };
    const months = Number(raw);
    if (Number.isInteger(months) && months >= 1 && months <= 240) return { value: String(months), months };
    return { value: '12', months: 12 };
}

function countFuture(records, today) {
    return normalizeRecords(records).filter(row => row.date > today).length;
}

function previousYearEnd(today) {
    return `${Number(today.slice(0, 4)) - 1}-12-31`;
}

function change(currentCents, base) {
    const baseCents = base.totalCents;
    return {
        date: base.through,
        base: fromCents(baseCents),
        change: fromCents(currentCents - baseCents),
        changePct: baseCents > 0 ? pct(currentCents - baseCents, baseCents) : null,
    };
}

export function buildPatrimonioView({ cash = [], investments = [], today, months = 12 }) {
    const now = wealthAt({ cash, investments, through: today });
    const first = firstRecordDate({ cash, investments, through: today });
    const total = now.totalCents;
    const weight = cents => (total > 0 ? pct(cents, total) : null);

    // Variación desde el cierre del primer mes con datos (si ese mes ya terminó).
    let sinceStart = null;
    if (first) {
        const firstMonthEnd = lastDayKey(first.slice(0, 7));
        if (firstMonthEnd < today) sinceStart = change(total, wealthAt({ cash, investments, through: firstMonthEnd }));
    }
    // Variación en el año: frente al 31 de diciembre anterior, si ya había datos entonces.
    let yearChange = null;
    const yearBase = previousYearEnd(today);
    if (first && first <= yearBase) yearChange = change(total, wealthAt({ cash, investments, through: yearBase }));

    const accounts = [
        ...now.products.map(p => ({
            type: 'Inversión', account: p.account, value: fromCents(p.valueCents),
            contributed: fromCents(p.contributedCents), gain: fromCents(p.gainCents), returnPct: p.returnPct,
            weightPct: weight(p.valueCents), date: p.date,
        })),
        ...now.cashAccounts.map(c => ({
            type: 'Efectivo', account: c.account, value: fromCents(c.valueCents),
            contributed: null, gain: null, returnPct: null, weightPct: weight(c.valueCents), date: c.date,
        })),
    ].sort((a, b) => b.value - a.value || a.account.localeCompare(b.account, 'es'));

    return {
        today,
        hasData: Boolean(first),
        futureRecords: countFuture(cash, today) + countFuture(investments, today),
        total: fromCents(total),
        cash: fromCents(now.cashCents),
        invested: fromCents(now.investedCents),
        contributed: fromCents(now.contributedCents),
        gain: fromCents(now.gainCents),
        returnPct: returnPct(now.gainCents, now.contributedCents),
        investedSharePct: weight(now.investedCents),
        firstDate: first,
        sinceStart,
        yearChange,
        accounts,
        distribution: [
            { name: 'Inversiones', value: fromCents(now.investedCents) },
            { name: 'Efectivo', value: fromCents(now.cashCents) },
        ],
        series: monthlyWealthSeries({ cash, investments, through: today, months }).map(p => ({
            month: p.month, date: p.date,
            cash: fromCents(p.cashCents), invested: fromCents(p.investedCents), total: fromCents(p.totalCents),
        })),
    };
}

function diversification(positions) {
    if (positions >= 5) return { level: 'high', label: 'Alta', desc: `${positions} posiciones abiertas` };
    if (positions >= 3) return { level: 'medium', label: 'Media', desc: `${positions} posiciones abiertas` };
    return { level: 'low', label: 'Baja', desc: positions === 1 ? 'Una sola posición abierta' : `Solo ${positions} posiciones abiertas` };
}

function concentration(maxWeight) {
    const text = `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(maxWeight)} %`;
    if (maxWeight > 50) return { level: 'low', label: 'Alta', desc: `${text} en una sola posición` };
    if (maxWeight > 30) return { level: 'medium', label: 'Moderada', desc: `${text} en la mayor posición` };
    return { level: 'high', label: 'Baja', desc: 'Ninguna posición pesa más del 30 %' };
}

export function buildInversionesView({ investments = [], today, months = 12 }) {
    const now = wealthAt({ investments, through: today });
    const value = now.investedCents;
    const open = now.products.filter(p => p.valueCents > 0);
    const weight = cents => (value > 0 ? pct(cents, value) : null);
    const maxWeight = open.length && value > 0 ? Math.max(...open.map(p => (p.valueCents / value) * 100)) : null;

    return {
        today,
        hasData: now.products.length > 0,
        futureRecords: countFuture(investments, today),
        contributed: fromCents(now.contributedCents),
        value: fromCents(value),
        gain: fromCents(now.gainCents),
        returnPct: returnPct(now.gainCents, now.contributedCents),
        positions: open.length,
        productCount: now.products.length,
        health: open.length ? { diversification: diversification(open.length), concentration: concentration(maxWeight) } : null,
        byAssetType: now.byAssetType.filter(t => t.valueCents > 0)
            .map(t => ({ name: t.assetType, value: fromCents(t.valueCents), sharePct: weight(t.valueCents) })),
        products: now.products.map(p => ({
            account: p.account, assetType: p.assetType, contributed: fromCents(p.contributedCents),
            value: fromCents(p.valueCents), gain: fromCents(p.gainCents), returnPct: p.returnPct,
            weightPct: weight(p.valueCents), date: p.date, closed: p.valueCents === 0,
        })),
        series: monthlyWealthSeries({ investments, through: today, months }).map(p => ({
            month: p.month, date: p.date, contributed: fromCents(p.contributedCents), value: fromCents(p.investedCents),
        })),
    };
}
