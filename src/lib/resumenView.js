// Datos ya preparados para pintar la página Resumen (Tarea NF-20). Funciones puras.
// El cálculo sale de src/lib/personalSummary.js, el mismo que usan /api/summary y el MCP: aquí solo se
// elige el periodo a partir de la URL y se ordena lo que la página enseña.
import { financialStatus, yearSeries } from './personalSummary.js';
import { formatEuro, formatPct } from './moneyFormat.js';

export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Colores de las categorías: hasta 5 con nombre y el resto juntas en «Otras».
export const MAX_SLICES = 6;

const first = value => (Array.isArray(value) ? value[0] : value);

// Periodo desde la URL:
//   /resumen                 → mes en curso
//   /resumen?anio=2025       → año completo 2025
//   /resumen?anio=2025&mes=3 → marzo de 2025 (mes de 1 a 12)
//   /resumen?mes=3           → marzo del año en curso
// Valores fuera de rango se ignoran y se usa el valor por defecto.
export function parseResumenPeriod(params = {}, today) {
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7)) - 1;
    const yearParam = Number(first(params.anio));
    const monthParam = Number(first(params.mes));
    const hasYear = Number.isInteger(yearParam) && yearParam >= 1900 && yearParam <= 2100;
    const hasMonth = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12;
    const year = hasYear ? yearParam : currentYear;
    if (hasMonth) return { view: 'month', year, month: monthParam - 1 };
    if (hasYear) return { view: 'year', year, month: -1 };
    return { view: 'month', year, month: currentMonth };
}

// Enlace canónico de un periodo (el mes en curso es /resumen a secas).
export function resumenHref({ view, year, month }, today) {
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7)) - 1;
    if (view === 'year') return `/resumen?anio=${year}`;
    if (year === currentYear && month === currentMonth) return '/resumen';
    return `/resumen?anio=${year}&mes=${month + 1}`;
}

export function periodLabel({ view, year, month }) {
    return view === 'year' ? String(year) : `${MONTH_NAMES[month]} de ${year}`;
}

// Años que ofrece el selector: del primer movimiento al último (o al año actual y al elegido).
export function selectableYears({ first: firstYear, last }, selectedYear, currentYear) {
    const from = Math.min(firstYear ?? currentYear, currentYear, selectedYear);
    const to = Math.max(last ?? currentYear, currentYear, selectedYear);
    return Array.from({ length: to - from + 1 }, (_, i) => to - i);
}

// Reparte una lista {name, value} en porciones con color fijo por posición: las 5 mayores y «Otras».
export function toSlices(items, otherLabel = 'Otras') {
    const positive = items.filter(item => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    const shown = positive.length > MAX_SLICES ? positive.slice(0, MAX_SLICES - 1) : positive;
    const rest = positive.slice(shown.length);
    const slices = shown.map((item, index) => ({ name: item.name, value: item.value, color: `var(--chart-${index + 1})` }));
    if (rest.length) {
        const value = Math.round(rest.reduce((sum, item) => sum + item.value, 0) * 100) / 100;
        slices.push({ name: `${otherLabel} (${rest.length})`, value, color: 'var(--chart-other)', members: rest.map(item => item.name) });
    }
    return slices.map(slice => ({ ...slice, sharePct: total > 0 ? Math.round((slice.value / total) * 1000) / 10 : 0 }));
}

function smartAlerts({ budget, totals }) {
    const alerts = [];
    if (budget.overCategories.length > 0) {
        alerts.push({
            type: 'danger', icon: '🚨',
            title: budget.overCategories.length === 1 ? 'Una categoría supera su presupuesto' : `${budget.overCategories.length} categorías superan su presupuesto`,
            desc: budget.overCategories.join(', '),
        });
    }
    if (budget.total > 0 && budget.ratio >= 70 && budget.ratio <= 100) {
        alerts.push({ type: 'warning', icon: '📊', title: 'Presupuesto en riesgo', desc: `Has consumido el ${formatPct(budget.ratio, 0)} de lo presupuestado` });
    }
    if (totals.savingsRate !== null && totals.savingsRate > 20) {
        alerts.push({ type: 'success', icon: '🎯', title: 'Buena tasa de ahorro', desc: `Estás ahorrando el ${formatPct(totals.savingsRate, 0)} de tus ingresos` });
    }
    if (totals.savings > 0 && budget.total > 0 && totals.savings * 0.7 > 100) {
        alerts.push({ type: 'success', icon: '💡', title: 'Margen para ahorrar o invertir', desc: `El 70 % de tu ahorro del periodo son ${formatEuro(totals.savings * 0.7)}` });
    }
    return alerts.slice(0, 4);
}

// summary: resultado de computePersonalSummary para el periodo, con la serie del año entero.
// years: { first, last } de recordYears().
export function buildResumenView({ summary, years, period, today }) {
    const { totals, budget, comparison } = summary;
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7)) - 1;
    const isYear = period.view === 'year';
    const [, , todayDay] = today.split('-').map(Number);
    const isRunningMonth = !isYear && period.year === currentYear && period.month === currentMonth;
    const daysInMonth = new Date(Date.UTC(period.year, period.month + 1, 0)).getUTCDate();
    const previousEmpty = comparison.previous.income === 0 && comparison.previous.expenses === 0;

    return {
        period,
        label: periodLabel(period),
        isCurrentMonth: isRunningMonth,
        isRunningMonth: isRunningMonth && summary.period.partial,
        years: selectableYears(years, period.year, currentYear),
        hasData: summary.hasData,
        status: financialStatus({ hasData: summary.hasData, budget, savings: totals.savings, savingsRate: totals.savingsRate }),
        totals,
        comparison: {
            label: comparison.previousLabel,
            description: comparison.description,
            previousEmpty,
            incomePct: comparison.change.incomePct,
            expensesPct: comparison.change.expensesPct,
            savings: previousEmpty ? null : comparison.change.savings,
        },
        budget: {
            ...budget,
            ratio: budget.ratio ?? 0,
            projected: isRunningMonth && summary.period.partial && todayDay > 0
                ? Math.round((budget.spent / todayDay) * daysInMonth * 100) / 100
                : null,
        },
        alerts: smartAlerts({ budget, totals }),
        charts: {
            monthly: yearSeries(summary.monthly, period.year).map(m => ({
                month: `${period.year}-${String(m.month + 1).padStart(2, '0')}`,
                income: m.income, expenses: m.expenses, savings: m.savings,
            })),
            categories: toSlices(summary.byCategory.map(c => ({ name: c.category, value: c.spent }))),
            types: typeSlices(summary.byType),
        },
    };
}

// Fijo y Variable tienen siempre el mismo color; otros tipos, los siguientes de la paleta.
export function typeSlices(byType) {
    const items = byType.filter(t => t.amount > 0);
    const total = items.reduce((sum, t) => sum + t.amount, 0);
    let next = 3;
    return items.map(t => {
        const slot = t.name === 'Fijo' ? 1 : t.name === 'Variable' ? 2 : next <= MAX_SLICES ? next++ : null;
        return {
            name: t.name, value: t.amount,
            color: slot ? `var(--chart-${slot})` : 'var(--chart-other)',
            sharePct: total > 0 ? Math.round((t.amount / total) * 1000) / 10 : 0,
        };
    });
}
