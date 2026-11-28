import test from 'node:test';
import assert from 'node:assert/strict';
import { changeFromPrevious, formatCurrency, jsonRequest, monthOptions, parseBudgetInputs, requestJson } from '../src/lib/utils.js';

const nbsp = text => text.replace(/\s/g, ' ');

test('formatCurrency usa el formato español de euros', () => {
    assert.equal(nbsp(formatCurrency(1234.5)), '1234,50 €');
    assert.equal(nbsp(formatCurrency('12345.5')), '12.345,50 €');
    assert.equal(nbsp(formatCurrency(undefined)), '0,00 €');
});

test('monthOptions da los doce meses en español con mayúscula', () => {
    const months = monthOptions();
    assert.equal(months.length, 12);
    assert.deepEqual(months[0], { value: 1, label: 'Enero' });
    assert.deepEqual(months[11], { value: 12, label: 'Diciembre' });
});

test('changeFromPrevious compara cada saldo con el anterior de la misma cuenta', () => {
    const records = [
        { id: 5, account: 'Banco', date: '2026-11-01T00:00:00.000Z', current_value: '1500.00' },
        { id: 4, account: 'Caja', date: '2026-11-01T00:00:00.000Z', current_value: '-20.00' },
        { id: 3, account: 'Banco', date: '2026-10-01T00:00:00.000Z', current_value: '1000.00' },
        { id: 2, account: 'Caja', date: '2026-10-01T00:00:00.000Z', current_value: '30.00' },
        { id: 1, account: 'Banco', date: '2026-09-01T00:00:00.000Z', current_value: '1200.00' },
    ];
    const changes = changeFromPrevious(records);
    assert.equal(changes.get(5), 500);
    assert.equal(changes.get(3), -200);
    assert.equal(changes.get(4), -50);
    assert.equal(changes.has(1), false);
    assert.equal(changes.has(2), false);
});

test('changeFromPrevious ignora registros del mismo día y fechas inválidas', () => {
    const changes = changeFromPrevious([
        { id: 1, account: 'A', date: '2026-10-01', current_value: 10 },
        { id: 2, account: 'A', date: '2026-10-01', current_value: 15 },
        { id: 3, account: 'A', date: '2026-10-02', current_value: 40 },
        { id: 4, account: 'A', date: 'no es fecha', current_value: 99 },
    ]);
    assert.equal(changes.has(1), false);
    assert.equal(changes.has(2), false);
    assert.equal(changes.get(3), 25);
    assert.equal(changes.has(4), false);
});

test('parseBudgetInputs acepta coma decimal, vacíos como 0 y marca los errores', () => {
    const { budgets, errors } = parseBudgetInputs({ Comida: '250,50', Ocio: '', Casa: '1.200', Viajes: 'mucho', Ropa: '-5' });
    assert.deepEqual(budgets, [
        { category: 'Comida', monthly_amount: '250.50' },
        { category: 'Ocio', monthly_amount: '0.00' },
        { category: 'Casa', monthly_amount: '1200.00' },
    ]);
    assert.deepEqual(Object.keys(errors), ['Viajes', 'Ropa']);
    assert.match(errors.Viajes, /no es un número válido/);
    assert.match(errors.Ropa, /no puede ser negativo/);
});

test('requestJson devuelve el JSON o lanza el error del servidor en español', async (t) => {
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });

    globalThis.fetch = async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    assert.deepEqual(await requestJson('/api/x'), { ok: 1 });

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Ya existe' }), { status: 400 });
    await assert.rejects(requestJson('/api/x'), error => error.message === 'Ya existe' && error.status === 400);

    globalThis.fetch = async () => new Response('no es json', { status: 502 });
    await assert.rejects(requestJson('/api/x'), /error \(502\)/);

    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(requestJson('/api/x'), /No hay conexión/);
});

test('jsonRequest prepara una petición JSON', () => {
    assert.deepEqual(jsonRequest('POST', { a: 1 }), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
});
