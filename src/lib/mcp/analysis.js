// Cálculos puros sobre los datos personales. Sin base de datos, para poder probarlos.
import { dateKey, fromCents, toCents } from './serialize.js';
import { computePersonalSummary, monthsInRange as sharedMonthsInRange } from '../personalSummary.js';

export function monthKey(value) {
    return dateKey(value).slice(0, 7);
}

// Meses naturales que toca el periodo [from, to], ambos AAAA-MM-DD.
export const monthsInRange = sharedMonthsInRange;

// Periodo anterior de la misma duración en días. El resumen ya no lo usa para comparar
// (ver comparisonRanges en ../personalSummary.js); se mantiene para tramos sueltos.
export function previousRange(from, to) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    const days = Math.round((end - start) / 86400000) + 1;
    const prevEnd = new Date(start); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - days + 1);
    return { from: dateKey(prevStart), to: dateKey(prevEnd) };
}

// Pasa el resumen común (../personalSummary.js) al formato que devuelve resumen_personal.
// Mantiene todos los campos de siempre; los añadidos van al final de cada bloque.
export function toMcpSummary(summary) {
    const { period, totals, budget, comparison } = summary;
    return {
        periodo: { desde: period.from, hasta: period.to, meses: period.months, meses_presupuesto: budget.months, en_curso: period.partial },
        ingresos: totals.income,
        gastos: totals.expenses,
        ahorro: totals.savings,
        tasa_ahorro_pct: totals.savingsRate,
        presupuesto_total: budget.total,
        // Solo el gasto de las categorías con presupuesto frente a ese presupuesto.
        gasto_sobre_presupuesto_pct: budget.ratio,
        categorias_desviadas: budget.overCategories,
        categorias_sin_presupuesto: budget.unbudgetedCategories,
        por_categoria: summary.byCategory.map(c => ({
            categoria: c.category, gastado: c.spent, presupuesto: c.budget,
            desviacion: c.deviation, desviacion_pct: c.deviationPct, peso_pct: c.sharePct,
        })),
        ingresos_por_categoria: summary.incomeByCategory.map(c => ({ categoria: c.name, importe: c.amount })),
        por_mes: summary.monthly.map(m => ({ mes: m.month, ingresos: m.income, gastos: m.expenses, ahorro: m.savings })),
        mayores_gastos: summary.topExpenses.map(r => ({
            id: r.id, fecha: r.date, importe: r.amount, categoria: r.category, subcategoria: r.subcategory, notas: r.notes,
        })),
        periodo_anterior: {
            desde: comparison.previous.from,
            hasta: comparison.previous.to,
            ingresos: comparison.previous.income,
            gastos: comparison.previous.expenses,
            ahorro: comparison.previous.savings,
            variacion_gastos_pct: comparison.change.expensesPct,
            variacion_ingresos_pct: comparison.change.incomePct,
            variacion_ahorro: comparison.change.savings,
            tipo: comparison.kind,
            parcial: comparison.partial,
            criterio: comparison.description,
            comparado_con: {
                desde: comparison.current.from, hasta: comparison.current.to,
                ingresos: comparison.current.income, gastos: comparison.current.expenses, ahorro: comparison.current.savings,
            },
        },
        presupuesto: {
            estado: budget.status,
            presupuestado: budget.total,
            gastado_en_categorias_con_presupuesto: budget.spent,
            restante: budget.remaining,
            gasto_sin_presupuesto: budget.unbudgetedSpent,
            por_categoria: budget.categories.map(c => ({
                categoria: c.category, mensual: c.monthly, presupuesto: c.budget, gastado: c.spent, restante: c.remaining, consumido_pct: c.ratio,
            })),
        },
        gasto_por_tipo: summary.byType.map(t => ({ tipo: t.name, importe: t.amount })),
    };
}

// Resumen de un periodo con el formato del MCP. Las filas deben cubrir el periodo y su tramo de comparación.
export function personalSummary({ expenses, incomes, budgets, from, to, today }) {
    return toMcpSummary(computePersonalSummary({ expenses, incomes, budgets, from, to, ...(today ? { today } : {}) }));
}

function latestPerAccount(records, through) {
    const latest = new Map();
    for (const record of records) {
        const day = dateKey(record.date);
        if (day > through) continue;
        const previous = latest.get(record.account);
        if (!previous || day > dateKey(previous.date) || (day === dateKey(previous.date) && record.id > previous.id)) latest.set(record.account, record);
    }
    return latest;
}

// Patrimonio a una fecha: último saldo de cada cuenta de efectivo y último valor de cada producto.
export function netWorth({ cash, investments, through }) {
    const cashLatest = latestPerAccount(cash, through);
    const invLatest = latestPerAccount(investments, through);
    const contributions = new Map();
    for (const record of investments) {
        if (dateKey(record.date) > through) continue;
        contributions.set(record.account, (contributions.get(record.account) || 0) + toCents(record.contribution));
    }
    const efectivo = [...cashLatest.values()].map(r => ({ cuenta: r.account, saldo: Number(r.current_value), fecha_dato: dateKey(r.date) }))
        .sort((a, b) => b.saldo - a.saldo);
    const inversiones = [...invLatest.values()].map(r => {
        const value = toCents(r.current_value);
        const contributed = contributions.get(r.account) || 0;
        return {
            producto: r.account, tipo_activo: r.asset_type, valor: fromCents(value), aportado: fromCents(contributed),
            plusvalia: fromCents(value - contributed), rentabilidad_pct: contributed ? Math.round(((value - contributed) / contributed) * 1000) / 10 : null,
            fecha_dato: dateKey(r.date),
        };
    }).sort((a, b) => b.valor - a.valor);
    const totalCash = efectivo.reduce((s, r) => s + toCents(r.saldo), 0);
    const totalInv = inversiones.reduce((s, r) => s + toCents(r.valor), 0);
    const totalContrib = inversiones.reduce((s, r) => s + toCents(r.aportado), 0);
    const byAssetType = new Map();
    for (const item of inversiones) byAssetType.set(item.tipo_activo, (byAssetType.get(item.tipo_activo) || 0) + toCents(item.valor));
    return {
        fecha: through,
        patrimonio_total: fromCents(totalCash + totalInv),
        liquido: fromCents(totalCash),
        invertido: fromCents(totalInv),
        aportado: fromCents(totalContrib),
        plusvalia: fromCents(totalInv - totalContrib),
        rentabilidad_pct: totalContrib ? Math.round(((totalInv - totalContrib) / totalContrib) * 1000) / 10 : null,
        peso_liquido_pct: totalCash + totalInv ? Math.round((totalCash / (totalCash + totalInv)) * 1000) / 10 : null,
        reparto_por_tipo: [...byAssetType].map(([tipo, cents]) => ({ tipo, valor: fromCents(cents), peso_pct: totalInv ? Math.round((cents / totalInv) * 1000) / 10 : 0 }))
            .sort((a, b) => b.valor - a.valor),
        efectivo,
        inversiones,
    };
}
