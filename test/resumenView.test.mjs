import test from 'node:test';
import assert from 'node:assert/strict';
import { computePersonalSummary, monthRange, yearRange } from '../src/lib/personalSummary.js';
import {
    buildResumenView, parseResumenPeriod, periodLabel, resumenHref, selectableYears, toSlices, typeSlices,
} from '../src/lib/resumenView.js';

const today = '2026-11-25';
const d = value => new Date(`${value}T00:00:00.000Z`);
let id = 1;
const gasto = (date, amount, category, expense_type = 'Variable') => ({ id: id++, date: d(date), amount, category, expense_type });
const ingreso = (date, amount) => ({ id: id++, date: d(date), amount, category: 'Nómina' });

test('periodo desde la URL', () => {
    assert.deepEqual(parseResumenPeriod({}, today), { view: 'month', year: 2026, month: 10 });
    assert.deepEqual(parseResumenPeriod({ anio: '2025' }, today), { view: 'year', year: 2025, month: -1 });
    assert.deepEqual(parseResumenPeriod({ anio: '2025', mes: '3' }, today), { view: 'month', year: 2025, month: 2 });
    assert.deepEqual(parseResumenPeriod({ mes: '12' }, today), { view: 'month', year: 2026, month: 11 });
    // Valores raros: se ignoran.
    assert.deepEqual(parseResumenPeriod({ anio: 'x', mes: '13' }, today), { view: 'month', year: 2026, month: 10 });
    assert.deepEqual(parseResumenPeriod({ anio: ['2024', '2023'] }, today), { view: 'year', year: 2024, month: -1 });
});

test('enlaces canónicos y etiquetas en español', () => {
    assert.equal(resumenHref({ view: 'month', year: 2026, month: 10 }, today), '/resumen');
    assert.equal(resumenHref({ view: 'month', year: 2026, month: 2 }, today), '/resumen?anio=2026&mes=3');
    assert.equal(resumenHref({ view: 'year', year: 2026, month: -1 }, today), '/resumen?anio=2026');
    assert.equal(periodLabel({ view: 'month', year: 2026, month: 10 }), 'noviembre de 2026');
    assert.equal(periodLabel({ view: 'year', year: 2025 }), '2025');
    assert.deepEqual(selectableYears({ first: 2024, last: 2026 }, 2026, 2026), [2026, 2025, 2024]);
    assert.deepEqual(selectableYears({ first: null, last: null }, 2026, 2026), [2026]);
    assert.deepEqual(selectableYears({ first: 2026, last: 2026 }, 2022, 2026), [2026, 2025, 2024, 2023, 2022]);
});

test('categorías: 5 con color propio y el resto en «Otras»', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, i) => ({ name, value: 70 - i * 10 }));
    const slices = toSlices([...items, { name: 'Cero', value: 0 }]);
    assert.equal(slices.length, 6);
    assert.deepEqual(slices.slice(0, 5).map(s => s.color), [1, 2, 3, 4, 5].map(n => `var(--chart-${n})`));
    assert.equal(slices[5].name, 'Otras (2)');
    assert.equal(slices[5].value, 30);
    assert.equal(slices[5].color, 'var(--chart-other)');
    assert.equal(Math.round(slices.reduce((s, x) => s + x.sharePct, 0)), 100);
    // Con 6 o menos no hace falta «Otras».
    assert.equal(toSlices(items.slice(0, 6)).length, 6);
    assert.equal(toSlices(items.slice(0, 6)).at(-1).color, 'var(--chart-6)');
});

test('fijo y variable tienen siempre el mismo color', () => {
    const slices = typeSlices([{ name: 'Variable', amount: 30 }, { name: 'Fijo', amount: 70 }, { name: 'Ocasional', amount: 0 }]);
    assert.deepEqual(slices.map(s => [s.name, s.color, s.sharePct]), [['Variable', 'var(--chart-2)', 30], ['Fijo', 'var(--chart-1)', 70]]);
});

test('vista del mes en curso: totales, comparación, proyección y serie del año', () => {
    const expenses = [gasto('2026-11-03', '300', 'Super', 'Fijo'), gasto('2026-11-10', '200', 'Ocio'), gasto('2026-10-05', '400', 'Super')];
    const incomes = [ingreso('2026-11-01', '2000'), ingreso('2026-10-01', '1800')];
    const budgets = [{ category: 'Super', monthly_amount: '500' }];
    const period = parseResumenPeriod({}, today);
    const series = yearRange(2026);
    const summary = computePersonalSummary({ expenses, incomes, budgets, ...monthRange(2026, 11), today, seriesFrom: series.from, seriesTo: series.to });
    const view = buildResumenView({ summary, years: { first: 2026, last: 2026 }, period, today });
    assert.equal(view.label, 'noviembre de 2026');
    assert.equal(view.isRunningMonth, true);
    assert.equal(view.totals.income, 2000);
    assert.equal(view.totals.expenses, 500);
    assert.equal(view.totals.savings, 1500);
    assert.equal(view.budget.total, 500);
    assert.equal(view.budget.spent, 300);
    assert.equal(view.budget.projected, 360); // 300 € en 25 días → 360 € en 30
    assert.equal(view.charts.monthly.length, 12);
    assert.deepEqual(view.charts.monthly[10], { month: '2026-11', income: 2000, expenses: 500, savings: 1500 });
    assert.deepEqual(view.charts.monthly[9], { month: '2026-10', income: 1800, expenses: 400, savings: 1400 });
    assert.deepEqual(view.charts.categories.map(c => c.name), ['Super', 'Ocio']);
    assert.ok(view.alerts.some(a => a.title === 'Buena tasa de ahorro'));
});

test('vista de un año cerrado sin datos: estado neutro y sin proyección', () => {
    const period = parseResumenPeriod({ anio: '2024' }, today);
    const summary = computePersonalSummary({ ...yearRange(2024), today });
    const view = buildResumenView({ summary, years: { first: null, last: null }, period, today });
    assert.equal(view.hasData, false);
    assert.equal(view.status.label, 'Sin datos');
    assert.equal(view.budget.projected, null);
    assert.deepEqual(view.charts.categories, []);
    assert.deepEqual(view.years, [2026, 2025, 2024]);
});
