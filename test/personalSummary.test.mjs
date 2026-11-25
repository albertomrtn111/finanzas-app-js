import test from 'node:test';
import assert from 'node:assert/strict';
import {
    budgetMonths, comparisonRanges, compareBudgets, computePersonalSummary, financialStatus, monthRange,
    periodTotals, rangeLabel, spentByCategory, summaryLoadRange, toCents, yearRange, yearSeries,
} from '../src/lib/personalSummary.js';
import { toMcpSummary } from '../src/lib/mcp/analysis.js';
import { formatCompactEuro, formatPct, formatSignedEuro, formatSignedPct } from '../src/lib/moneyFormat.js';

const d = value => new Date(`${value}T00:00:00.000Z`);
const gasto = (date, amount, category, extra = {}) => ({ id: Math.random(), date: d(date), amount, category, ...extra });
const ingreso = (date, amount, category = 'Nómina') => ({ id: Math.random(), date: d(date), amount, category });
const nbsp = text => text.replace(/ /g, ' ');

test('las categorías sin presupuesto no cuentan como exceso', () => {
    const summary = computePersonalSummary({
        expenses: [gasto('2026-10-05', '250.00', 'Supermercado'), gasto('2026-10-10', '1250.00', 'Viajes')],
        incomes: [ingreso('2026-10-01', '2000')],
        budgets: [{ category: 'Supermercado', monthly_amount: '300' }, { category: 'Ocio', monthly_amount: '0.00' }],
        ...monthRange(2026, 10), today: '2026-11-24',
    });
    assert.equal(summary.totals.expenses, 1500);
    assert.equal(summary.budget.total, 300);
    assert.equal(summary.budget.spent, 250);
    assert.equal(summary.budget.ratio, 83.3);
    assert.equal(summary.budget.unbudgetedSpent, 1250);
    assert.deepEqual(summary.budget.unbudgetedCategories, ['Viajes']);
    assert.deepEqual(summary.budget.overCategories, []);
    assert.equal(summary.budget.status, 'en_orden');
    // Un presupuesto de 0 € es «sin presupuesto», no un límite que se supera con el primer euro.
    assert.equal(summary.budget.categories.length, 1);
    assert.equal(summary.byCategory.find(c => c.category === 'Viajes').budget, null);
    const status = financialStatus({ hasData: true, budget: summary.budget, savings: summary.totals.savings, savingsRate: summary.totals.savingsRate });
    assert.notEqual(status.label, 'Excedido');
    assert.equal(status.level, 'success');
});

test('excedido y riesgo dependen solo de las categorías con presupuesto', () => {
    const spent = new Map([['Supermercado', 35000], ['Casa', 10000], ['Viajes', 999900]]);
    const over = compareBudgets({ budgets: [{ category: 'Supermercado', monthly_amount: 300 }, { category: 'Casa', monthly_amount: 500 }], spent });
    assert.equal(over.status, 'riesgo');
    assert.deepEqual(over.overCategories, ['Supermercado']);
    assert.equal(over.categories[0].category, 'Supermercado');
    assert.equal(over.categories[0].remaining, -50);
    const exceeded = compareBudgets({ budgets: [{ category: 'Supermercado', monthly_amount: 300 }], spent });
    assert.equal(exceeded.status, 'excedido');
    assert.equal(financialStatus({ hasData: true, budget: exceeded, savings: 10, savingsRate: 50 }).label, 'Excedido');
    assert.equal(compareBudgets({ budgets: [], spent }).status, 'sin_presupuesto');
});

test('importes en céntimos: 0,1 + 0,2 = 0,3 exacto', () => {
    assert.equal(toCents('0.1') + toCents('0.2'), 30);
    assert.equal(toCents({ toString: () => '12.30' }), 1230);
    assert.equal(toCents('-5.5'), -550);
    assert.equal(toCents(0.1 + 0.2), 30);
    const totals = periodTotals({
        expenses: [gasto('2026-11-01', 0.1, 'A'), gasto('2026-11-02', '0.2', 'A')],
        incomes: Array.from({ length: 10 }, () => ingreso('2026-11-03', '0.1')),
        ...monthRange(2026, 11),
    });
    assert.equal(totals.expenses, 0.3);
    assert.equal(totals.income, 1);
    assert.equal(totals.savings, 0.7);
    assert.equal(spentByCategory([gasto('2026-11-01', '0.10', 'A'), gasto('2026-11-01', '0.20', 'A')]).get('A'), 30);
});

test('mes en curso: se compara con el mes anterior hasta el mismo día', () => {
    const ranges = comparisonRanges({ ...monthRange(2026, 11), today: '2026-11-24' });
    assert.equal(ranges.kind, 'mes');
    assert.equal(ranges.partial, true);
    assert.deepEqual(ranges.current, { from: '2026-11-01', to: '2026-11-24' });
    assert.deepEqual(ranges.previous, { from: '2026-10-01', to: '2026-10-24' });
    assert.equal(ranges.previousLabel, '1–24 oct 2026');
    assert.match(ranges.description, /hasta el mismo día/);

    const summary = computePersonalSummary({
        expenses: [
            gasto('2026-10-10', '100', 'Comida'), gasto('2026-10-28', '900', 'Comida'), // el 28 queda fuera del tramo
            gasto('2026-11-10', '150', 'Comida'),
        ],
        incomes: [],
        budgets: [],
        ...monthRange(2026, 11), today: '2026-11-24',
    });
    assert.equal(summary.comparison.previous.expenses, 100);
    assert.equal(summary.comparison.change.expensesPct, 50);
    assert.equal(summary.comparison.change.incomePct, null);

    // Mes cerrado: frente al mes anterior completo, aunque tengan distinta duración.
    assert.deepEqual(comparisonRanges({ ...monthRange(2026, 10), today: '2026-11-24' }).previous, { from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(comparisonRanges({ ...monthRange(2026, 11), today: '2026-12-02' }).previous, { from: '2026-10-01', to: '2026-10-31' });
    // El 30 de marzo se compara con todo febrero (no hay 30 de febrero).
    assert.deepEqual(comparisonRanges({ ...monthRange(2027, 3), today: '2027-03-30' }).previous, { from: '2027-02-01', to: '2027-02-28' });
    // Enero se compara con diciembre del año anterior.
    assert.deepEqual(comparisonRanges({ ...monthRange(2026, 1), today: '2026-06-01' }).previous, { from: '2025-12-01', to: '2025-12-31' });
});

test('año en curso: se compara con las mismas fechas del año anterior', () => {
    const ranges = comparisonRanges({ ...yearRange(2026), today: '2026-02-10' });
    assert.equal(ranges.kind, 'anio');
    assert.deepEqual(ranges.current, { from: '2026-01-01', to: '2026-02-10' });
    assert.deepEqual(ranges.previous, { from: '2025-01-01', to: '2025-02-10' });

    const expenses = [
        gasto('2025-01-15', '1000', 'Casa'), gasto('2025-06-15', '5000', 'Casa'), gasto('2025-12-15', '5000', 'Casa'),
        gasto('2026-01-15', '1100', 'Casa'),
    ];
    const range = yearRange(2026);
    const load = summaryLoadRange({ ...range, today: '2026-02-10' });
    assert.deepEqual(load, { from: '2025-01-01', to: '2026-12-31' });
    const summary = computePersonalSummary({ expenses, incomes: [], budgets: [], ...range, today: '2026-02-10' });
    // Antes salía -90 % (1.100 € frente a todo 2025); ahora +10 % frente al 1 ene–10 feb de 2025.
    assert.equal(summary.comparison.previous.expenses, 1000);
    assert.equal(summary.comparison.change.expensesPct, 10);

    // Año cerrado: frente al año anterior completo.
    assert.deepEqual(comparisonRanges({ ...yearRange(2025), today: '2026-02-10' }).previous, { from: '2024-01-01', to: '2024-12-31' });
    assert.equal(rangeLabel('2024-01-01', '2024-12-31'), '2024');
    // Otros tramos: los mismos días justo antes.
    assert.deepEqual(comparisonRanges({ from: '2026-11-10', to: '2026-11-19', today: '2026-11-24' }).previous, { from: '2026-10-31', to: '2026-11-09' });
});

test('presupuesto anual: meses transcurridos en el año en curso y 12 en años pasados', () => {
    const budgets = [{ category: 'Comida', monthly_amount: '300' }];
    assert.equal(budgetMonths({ ...yearRange(2026), today: '2026-11-24' }), 11);
    assert.equal(budgetMonths({ ...yearRange(2025), today: '2026-11-24' }), 12);
    assert.equal(budgetMonths({ ...monthRange(2026, 11), today: '2026-11-24' }), 1);
    const current = computePersonalSummary({ expenses: [], incomes: [], budgets, ...yearRange(2026), today: '2026-11-24' });
    assert.equal(current.budget.total, 3300);
    assert.equal(current.budget.months, 11);
    const past = computePersonalSummary({ expenses: [], incomes: [], budgets, ...yearRange(2025), today: '2026-11-24' });
    assert.equal(past.budget.total, 3600);
});

test('sin datos: ceros, sin tasa de ahorro y sin «Bajo control»', () => {
    const summary = computePersonalSummary({ expenses: [], incomes: [], budgets: [], ...monthRange(2026, 11), today: '2026-11-24' });
    assert.equal(summary.hasData, false);
    assert.deepEqual(summary.totals, { income: 0, expenses: 0, savings: 0, savingsRate: null });
    assert.equal(summary.budget.status, 'sin_presupuesto');
    assert.equal(summary.budget.ratio, null);
    assert.equal(summary.comparison.change.expensesPct, null);
    assert.deepEqual(summary.byCategory, []);
    assert.equal(summary.monthly.length, 1);
    const status = financialStatus({ hasData: false, budget: summary.budget, savings: 0, savingsRate: null });
    assert.equal(status.level, 'neutral');
    assert.notEqual(status.label, 'Bajo control');
    assert.equal(yearSeries(summary.monthly, 2026).length, 12);
});

test('serie mensual, fijo frente a variable y formato del MCP compatible', () => {
    const summary = computePersonalSummary({
        expenses: [
            gasto('2026-09-30', '999', 'Casa'), // fuera del periodo y de la serie
            gasto('2026-10-01', '700', 'Casa', { expense_type: 'Fijo' }),
            gasto('2026-10-02', '50', 'Ocio', { expense_type: null }),
            gasto('2026-11-02', '25.25', 'Ocio', { expense_type: 'Variable' }),
        ],
        incomes: [ingreso('2026-10-01', '2000'), ingreso('2026-11-01', '2000')],
        budgets: [{ category: 'Casa', monthly_amount: '700' }],
        from: '2026-10-01', to: '2026-11-30', today: '2026-11-24',
    });
    assert.deepEqual(summary.monthly.map(m => m.expenses), [750, 25.25]);
    assert.deepEqual(summary.byType, [{ name: 'Fijo', amount: 700 }, { name: 'Variable', amount: 75.25 }]);

    const mcp = toMcpSummary(summary);
    for (const key of ['periodo', 'ingresos', 'gastos', 'ahorro', 'tasa_ahorro_pct', 'presupuesto_total', 'gasto_sobre_presupuesto_pct',
        'categorias_desviadas', 'categorias_sin_presupuesto', 'por_categoria', 'ingresos_por_categoria', 'por_mes', 'mayores_gastos', 'periodo_anterior']) {
        assert.ok(key in mcp, key);
    }
    for (const key of ['desde', 'hasta', 'ingresos', 'gastos', 'ahorro', 'variacion_gastos_pct', 'variacion_ingresos_pct']) {
        assert.ok(key in mcp.periodo_anterior, key);
    }
    assert.deepEqual(Object.keys(mcp.por_categoria[0]), ['categoria', 'gastado', 'presupuesto', 'desviacion', 'desviacion_pct', 'peso_pct']);
    assert.deepEqual(Object.keys(mcp.mayores_gastos[0]), ['id', 'fecha', 'importe', 'categoria', 'subcategoria', 'notas']);
    assert.deepEqual(mcp.por_mes[0], { mes: '2026-10', ingresos: 2000, gastos: 750, ahorro: 1250 });
    // Presupuesto de Casa: 700 € × 2 meses; el gasto de Ocio no cuenta.
    assert.equal(mcp.presupuesto_total, 1400);
    assert.equal(mcp.gasto_sobre_presupuesto_pct, 50);
    assert.equal(mcp.presupuesto.gasto_sin_presupuesto, 75.25);
    assert.deepEqual(mcp.categorias_sin_presupuesto, ['Ocio']);
    // Varios meses desde el día 1, en curso: los mismos días dos meses antes.
    assert.deepEqual([mcp.periodo_anterior.desde, mcp.periodo_anterior.hasta], ['2026-08-01', '2026-09-24']);
    assert.deepEqual([mcp.periodo_anterior.comparado_con.desde, mcp.periodo_anterior.comparado_con.hasta], ['2026-10-01', '2026-11-24']);
});

test('formatos cortos en español para ejes y variaciones', () => {
    assert.equal(formatCompactEuro(850), nbsp('850 €'));
    assert.equal(formatCompactEuro(0), nbsp('0 €'));
    assert.equal(formatCompactEuro(1200), nbsp('1,2 mil €'));
    assert.equal(formatCompactEuro(-300), nbsp('-300 €'));
    assert.equal(formatCompactEuro(1500000), nbsp('1,5 M€'));
    assert.equal(formatPct(41.5), nbsp('41,5 %'));
    assert.equal(formatSignedPct(12.5), nbsp('+12,5 %'));
    assert.equal(formatSignedPct(-3), nbsp('-3 %'));
    assert.equal(formatSignedEuro(-20.5), `-${nbsp('20,50 €')}`);
});
