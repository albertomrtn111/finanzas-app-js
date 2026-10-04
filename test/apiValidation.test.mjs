import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseFinancialRecord, parseId, parsePagination } from '../src/lib/apiValidation.js';

test('rechaza fechas inexistentes y acepta fechas válidas en UTC', () => {
    assert.equal(parseDate('2026-02-29'), null);
    assert.equal(parseDate('2024-02-29')?.toISOString(), '2024-02-29T00:00:00.000Z');
    assert.equal(parseDate('04/10/2026'), null);
});

test('valida dinero y límites de campos antes de guardar', () => {
    const base = { date: '2026-10-04', amount: '25.50', category: ' Comida ' };
    assert.equal(parseFinancialRecord('expense', base).value.category, 'Comida');
    assert.match(parseFinancialRecord('expense', { ...base, amount: '-1' }).error, /importe/);
    assert.match(parseFinancialRecord('expense', { ...base, amount: '1.234' }).error, /decimales/);
    assert.match(parseFinancialRecord('expense', { ...base, category: 'x'.repeat(101) }).error, /categoría/);
    assert.equal(parseFinancialRecord('cash', { date: base.date, account: 'Banco', current_value: '0' }).value.current_value, '0');
    assert.equal(parseFinancialRecord('investment', { date: base.date, account: 'ETF', asset_type: 'Acciones', contribution: '-5', current_value: '20' }).value.contribution, '-5');
});

test('la paginación solo acepta enteros acotados y los identificadores son positivos', () => {
    assert.deepEqual(parsePagination(new URLSearchParams()).value, {});
    assert.deepEqual(parsePagination(new URLSearchParams('limit=50&offset=100')).value, { take: 50, skip: 100 });
    assert.ok(parsePagination(new URLSearchParams('limit=100000')).error);
    assert.ok(parsePagination(new URLSearchParams('limit=1&offset=-1')).error);
    assert.equal(parseId('2abc'), null);
    assert.equal(parseId('2'), 2);
});
