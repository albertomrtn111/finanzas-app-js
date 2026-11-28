// Filtros de GET /api/expenses y GET /api/income (Tarea NF-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { movementWhere, parseMovementFilters, totalsHeaders } from '../src/lib/movementFilters.js';

const params = query => new URLSearchParams(query);

test('la API valida los filtros con errores en español', () => {
    assert.deepEqual(parseMovementFilters(params('')), { value: {} });
    assert.deepEqual(parseMovementFilters(params('limit=50&offset=0&q=&category=')), { value: {} });
    assert.deepEqual(parseMovementFilters(params('q=%20Mercadona%20&category=Super&from=2026-11-01&to=2026-11-30&min=0&max=12.5')), {
        value: { q: 'Mercadona', category: 'Super', from: '2026-11-01', to: '2026-11-30', min: '0', max: '12.5' },
    });
    const bad = (query, pattern) => assert.match(parseMovementFilters(params(query)).error || '', pattern, query);
    bad('from=2026-13-01', /desde.*AAAA-MM-DD/);
    bad('to=25/11/2026', /hasta.*AAAA-MM-DD/);
    bad('from=2026-02-30', /desde/);
    bad('from=2026-11-30&to=2026-11-01', /posterior/);
    bad('min=abc', /mínimo/);
    bad('min=-5', /mínimo/);
    bad('max=12,50', /máximo/);
    bad('max=1.234', /máximo/);
    bad('min=20&max=10', /mínimo no puede ser mayor/);
    bad(`q=${'x'.repeat(101)}`, /búsqueda/);
    bad(`category=${'x'.repeat(101)}`, /categoría/);
    bad('q=a&q=b', /repetido/);
});

test('el where siempre filtra por el usuario y busca cada palabra en sus campos', () => {
    assert.deepEqual(movementWhere('expense', 3, {}), { user_id: 3 });
    const where = movementWhere('expense', 3, { q: 'mercadona  tarjeta', category: 'Super', from: '2026-11-01', to: '2026-11-30', min: '10', max: '20.5' });
    assert.equal(where.user_id, 3);
    assert.equal(where.category, 'Super');
    assert.equal(where.date.gte.toISOString(), '2026-11-01T00:00:00.000Z');
    assert.equal(where.date.lte.toISOString(), '2026-11-30T00:00:00.000Z');
    assert.deepEqual(where.amount, { gte: '10', lte: '20.5' });
    assert.equal(where.AND.length, 2);
    assert.deepEqual(where.AND[0].OR.map(condition => Object.keys(condition)[0]), ['notes', 'subcategory', 'category', 'payment_method']);
    assert.deepEqual(where.AND[1].OR[0], { notes: { contains: 'tarjeta', mode: 'insensitive' } });
    assert.deepEqual(movementWhere('income', 3, { q: 'acme' }).AND[0].OR.map(condition => Object.keys(condition)[0]), ['notes', 'source', 'category']);
    assert.deepEqual(movementWhere('income', 3, { from: '2026-01-01' }).date, { gte: new Date('2026-01-01T00:00:00.000Z') });
});

test('cabeceras con el número de resultados y el total del filtro', () => {
    assert.deepEqual(totalsHeaders({ _count: { _all: 3 }, _sum: { amount: 21.4 } }), { 'X-Total-Count': '3', 'X-Total-Amount': '21.40' });
    assert.deepEqual(totalsHeaders({ _count: { _all: 0 }, _sum: { amount: null } }), { 'X-Total-Count': '0', 'X-Total-Amount': '0.00' });
    assert.deepEqual(totalsHeaders({ _count: { _all: 1 }, _sum: { amount: '7.5' } }), { 'X-Total-Count': '1', 'X-Total-Amount': '7.50' });
});
