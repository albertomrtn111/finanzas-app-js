import test from 'node:test';
import assert from 'node:assert/strict';
import { amountToInput, parseAmountInput } from '../src/lib/amount.js';
import { formatDate, formatDayHeading, todayKey } from '../src/lib/dateFormat.js';

test('importes escritos al estilo español', () => {
    const ok = (text, value, options) => assert.deepEqual(parseAmountInput(text, options), { value }, text);
    ok('12,50', '12.50');
    ok('12,5', '12.50');
    ok('12.5', '12.50');
    ok('12.50', '12.50');
    ok('1234', '1234.00');
    ok('1.234', '1234.00');
    ok('1.234,56', '1234.56');
    ok('1,234.56', '1234.56');
    ok('1.234.567,8', '1234567.80');
    ok(' 45 € ', '45.00');
    ok(',5', '0.50');
    ok('-20', '-20.00', { allowNegative: true });
    ok('0', '0.00', { allowZero: true });
});

test('importes no válidos con un mensaje claro', () => {
    const bad = (text, pattern, options) => assert.match(parseAmountInput(text, options).error || '', pattern, text);
    bad('', /obligatorio/);
    bad('abc', /no es un número/);
    bad('12,345', /dos decimales/);
    bad('1,2,3', /no es un número/);
    bad('12.34.5', /no es un número/);
    bad('1e3', /no es un número/);
    bad('-5', /negativo/);
    bad('0', /mayor que 0/);
    bad('0x1F', /no es un número/);
});

test('importe guardado para editarlo en un campo', () => {
    assert.equal(amountToInput('12.5'), '12,50');
    assert.equal(amountToInput(1234), '1234,00');
    assert.equal(amountToInput(null), '');
});

test('fechas en español', () => {
    const now = new Date('2026-11-25T10:00:00Z');
    assert.equal(todayKey(now), '2026-11-25');
    assert.equal(formatDate('2026-11-24'), '24 nov 2026');
    assert.equal(formatDayHeading('2026-11-25', now), 'Hoy');
    assert.equal(formatDayHeading('2026-11-24', now), 'Ayer');
    assert.equal(formatDayHeading('2026-11-23', now), 'lunes, 23 de noviembre');
    assert.equal(formatDayHeading('2025-11-23', now), '23 nov 2025');
});
