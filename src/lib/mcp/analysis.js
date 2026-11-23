// Cálculos puros sobre los datos personales. Sin base de datos, para poder probarlos.
import { dateKey, fromCents, toCents } from './serialize.js';

export function monthKey(value) {
    return dateKey(value).slice(0, 7);
}

// Meses naturales que toca el periodo [from, to], ambos AAAA-MM-DD.
export function monthsInRange(from, to) {
    const months = [];
    let [year, month] = from.slice(0, 7).split('-').map(Number);
    const [endYear, endMonth] = to.slice(0, 7).split('-').map(Number);
    while (year < endYear || (year === endYear && month <= endMonth)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return months;
}

// Periodo anterior de la misma duración en días.
export function previousRange(from, to) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    const days = Math.round((end - start) / 86400000) + 1;
    const prevEnd = new Date(start); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setUTCDate(prevStart.getUTCDate() - days + 1);
    return { from: dateKey(prevStart), to: dateKey(prevEnd) };
}

function sumBy(records, keyFn) {
    const totals = new Map();
    for (const record of records) {
        const key = keyFn(record) ?? 'Sin clasificar';
        totals.set(key, (totals.get(key) || 0) + toCents(record.amount));
    }
    return totals;
}

// Resumen de un periodo: totales, ahorro, gasto por categoría frente al presupuesto y serie mensual.
export function personalSummary({ expenses, incomes, budgets, from, to, previous = null }) {
    const income = incomes.reduce((sum, r) => sum + toCents(r.amount), 0);
    const expense = expenses.reduce((sum, r) => sum + toCents(r.amount), 0);
    const months = monthsInRange(from, to);
    const budgetByCategory = new Map(budgets.map(b => [b.category, toCents(b.monthly_amount)]));
    const spentByCategory = sumBy(expenses, r => r.category);
    const categories = new Set([...spentByCategory.keys(), ...[...budgetByCategory.keys()].filter(c => budgetByCategory.get(c) > 0)]);

    const byCategory = [...categories].map(category => {
        const spent = spentByCategory.get(category) || 0;
        const monthly = budgetByCategory.get(category) ?? null;
        const budget = monthly === null ? null : monthly * months.length;
        return {
            categoria: category,
            gastado: fromCents(spent),
            presupuesto: budget === null ? null : fromCents(budget),
            desviacion: budget === null ? null : fromCents(spent - budget),
            desviacion_pct: budget ? Math.round(((spent - budget) / budget) * 1000) / 10 : null,
            peso_pct: expense ? Math.round((spent / expense) * 1000) / 10 : 0,
        };
    }).sort((a, b) => b.gastado - a.gastado);

    const monthly = months.map(month => {
        const inc = incomes.filter(r => monthKey(r.date) === month).reduce((s, r) => s + toCents(r.amount), 0);
        const exp = expenses.filter(r => monthKey(r.date) === month).reduce((s, r) => s + toCents(r.amount), 0);
        return { mes: month, ingresos: fromCents(inc), gastos: fromCents(exp), ahorro: fromCents(inc - exp) };
    });

    const totalBudget = byCategory.reduce((s, c) => s + (c.presupuesto === null ? 0 : toCents(c.presupuesto)), 0);
    const result = {
        periodo: { desde: from, hasta: to, meses: months.length },
        ingresos: fromCents(income),
        gastos: fromCents(expense),
        ahorro: fromCents(income - expense),
        tasa_ahorro_pct: income ? Math.round(((income - expense) / income) * 1000) / 10 : null,
        presupuesto_total: fromCents(totalBudget),
        gasto_sobre_presupuesto_pct: totalBudget ? Math.round((expense / totalBudget) * 1000) / 10 : null,
        categorias_desviadas: byCategory.filter(c => c.desviacion !== null && c.desviacion > 0).map(c => c.categoria),
        categorias_sin_presupuesto: byCategory.filter(c => c.presupuesto === null).map(c => c.categoria),
        por_categoria: byCategory,
        ingresos_por_categoria: [...sumBy(incomes, r => r.category)].map(([categoria, cents]) => ({ categoria, importe: fromCents(cents) }))
            .sort((a, b) => b.importe - a.importe),
        por_mes: monthly,
        mayores_gastos: [...expenses].sort((a, b) => toCents(b.amount) - toCents(a.amount)).slice(0, 10)
            .map(r => ({ id: r.id, fecha: dateKey(r.date), importe: Number(r.amount), categoria: r.category, subcategoria: r.subcategory, notas: r.notes })),
    };
    if (previous) {
        const prevIncome = previous.incomes.reduce((s, r) => s + toCents(r.amount), 0);
        const prevExpense = previous.expenses.reduce((s, r) => s + toCents(r.amount), 0);
        result.periodo_anterior = {
            desde: previous.from, hasta: previous.to,
            ingresos: fromCents(prevIncome), gastos: fromCents(prevExpense), ahorro: fromCents(prevIncome - prevExpense),
            variacion_gastos_pct: prevExpense ? Math.round(((expense - prevExpense) / prevExpense) * 1000) / 10 : null,
            variacion_ingresos_pct: prevIncome ? Math.round(((income - prevIncome) / prevIncome) * 1000) / 10 : null,
        };
    }
    return result;
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
