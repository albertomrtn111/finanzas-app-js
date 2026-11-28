// Lista de Registro por días y filtros de la pantalla (Tarea NF-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_FILTERS, dayOf, filtersToQuery, groupByDay, hasActiveFilters, periodRange, toCents } from '../src/lib/movementList.js';

test('importes a céntimos sin errores de coma flotante', () => {
    assert.equal(toCents('12.5'), 1250);
    assert.equal(toCents('0.1'), 10);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(toCents('1234.56'), 123456);
    assert.equal(toCents('-3.05'), -305);
    assert.equal(toCents(77.7), 7770);
    assert.equal(toCents(null), 0);
});

test('la lista se agrupa por días con el total de cada día en céntimos', () => {
    const items = [
        { id: 5, date: '2026-11-25T00:00:00.000Z', amount: '0.10' },
        { id: 4, date: '2026-11-25T00:00:00.000Z', amount: '0.20' },
        { id: 3, date: '2026-11-24T00:00:00.000Z', amount: '12.5' },
        { id: 2, date: '2026-11-20', amount: 100 },
        { id: 1, date: '2026-11-20', amount: '0.01' },
    ];
    const groups = groupByDay(items);
    assert.deepEqual(groups.map(group => [group.day, group.totalCents, group.items.map(item => item.id)]), [
        ['2026-11-25', 30, [5, 4]],
        ['2026-11-24', 1250, [3]],
        ['2026-11-20', 10001, [2, 1]],
    ]);
    assert.equal(dayOf(items[0]), '2026-11-25');
    assert.deepEqual(groupByDay([]), []);
});

test('periodos del filtro de fechas', () => {
    const today = '2026-01-15';
    assert.deepEqual(periodRange('all', { today }), {});
    assert.deepEqual(periodRange('this-month', { today }), { from: '2026-01-01', to: '2026-01-31' });
    assert.deepEqual(periodRange('last-month', { today }), { from: '2025-12-01', to: '2025-12-31' });
    assert.deepEqual(periodRange('this-year', { today }), { from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(periodRange('month', { today, month: '2024-02' }), { from: '2024-02-01', to: '2024-02-29' });
    assert.deepEqual(periodRange('month', { today, month: '' }), {});
    assert.deepEqual(periodRange('range', { today, from: '2026-01-02' }), { from: '2026-01-02' });
});

test('los filtros de la pantalla se convierten en la consulta de la API', () => {
    assert.deepEqual(filtersToQuery(EMPTY_FILTERS, { today: '2026-11-25' }), { query: '', errors: null });
    const filters = { ...EMPTY_FILTERS, q: ' super ', category: 'Hogar', period: 'this-month', min: '10,5', max: '1.000' };
    assert.equal(filtersToQuery(filters, { today: '2026-11-25' }).query, 'q=super&category=Hogar&from=2026-11-01&to=2026-11-30&min=10.50&max=1000.00');
    // La búsqueda que se usa es la ya retrasada (q), no la que se está escribiendo.
    assert.equal(filtersToQuery({ ...EMPTY_FILTERS, q: 'merc' }, { today: '2026-11-25', q: '' }).query, '');
    assert.match(filtersToQuery({ ...EMPTY_FILTERS, min: 'abc' }, { today: '2026-11-25' }).errors.min, /mínimo/);
    assert.match(filtersToQuery({ ...EMPTY_FILTERS, min: '50', max: '10' }, { today: '2026-11-25' }).errors.max, /menor/);
    assert.match(filtersToQuery({ ...EMPTY_FILTERS, period: 'range', from: '2026-11-20', to: '2026-11-01' }, { today: '2026-11-25' }).errors.range, /posterior/);
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: '  ' }), false);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, period: 'last-month' }), true);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, max: '20' }), true);
});
