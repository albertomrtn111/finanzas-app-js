// Formulario único de gasto e ingreso (Tarea NF-17).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    NEW_CATEGORY, emptyMovementForm, findCategory, formFromRecord, movementPayload, movementSummary, pickCategory, recordToPayload,
} from '../src/lib/movementForm.js';

test('el formulario acepta importes con coma y prepara el gasto para la API', () => {
    const form = { ...emptyMovementForm({ today: '2026-11-25', category: 'Supermercado' }), amount: '12,50', notes: '  Mercadona  ' };
    assert.deepEqual(movementPayload('expense', form), {
        value: { date: '2026-11-25', amount: '12.50', category: 'Supermercado', notes: 'Mercadona', subcategory: null, payment_method: 'Tarjeta', expense_type: 'Variable' },
    });
    assert.equal(movementPayload('expense', { ...form, amount: '1.234,56' }).value.amount, '1234.56');
    assert.equal(movementPayload('expense', { ...form, amount: '1.234' }).value.amount, '1234.00');
    // Un ingreso solo lleva sus campos.
    assert.deepEqual(movementPayload('income', { ...form, category: 'Nómina', source: 'Acme', amount: '1500' }).value, {
        date: '2026-11-25', amount: '1500.00', category: 'Nómina', notes: 'Mercadona', source: 'Acme',
    });
});

test('el formulario explica cada error en español', () => {
    const base = emptyMovementForm({ today: '2026-11-25', category: 'Hogar' });
    assert.match(movementPayload('expense', { ...base, amount: '' }).errors.amount, /obligatorio/);
    assert.match(movementPayload('expense', { ...base, amount: '12,345' }).errors.amount, /dos decimales/);
    assert.match(movementPayload('expense', { ...base, amount: '0' }).errors.amount, /mayor que 0/);
    assert.match(movementPayload('expense', { ...base, amount: '-3' }).errors.amount, /negativo/);
    assert.match(movementPayload('expense', { ...base, amount: '5', date: '2026-02-30' }).errors.date, /fecha/);
    assert.match(movementPayload('expense', { ...base, amount: '5', category: NEW_CATEGORY }).errors.category, /categoría/);
    assert.match(movementPayload('expense', { ...base, amount: '5', category: '   ' }).errors.category, /categoría/);
    assert.match(movementPayload('income', { ...base, amount: '5', source: 'x'.repeat(151) }).errors.source, /150/);
});

test('editar parte del registro guardado y «Deshacer» lo recrea igual', () => {
    const record = { id: 7, date: '2026-11-23T00:00:00.000Z', amount: '12.5', category: 'Supermercado', subcategory: null, payment_method: 'Bizum', expense_type: 'Fijo', notes: 'Pan' };
    const form = formFromRecord(record);
    assert.equal(form.date, '2026-11-23');
    assert.equal(form.amount, '12,50');
    assert.equal(form.payment_method, 'Bizum');
    assert.equal(movementPayload('expense', form).value.amount, '12.50');
    assert.deepEqual(recordToPayload('expense', record), { date: '2026-11-23', amount: '12.50', category: 'Supermercado', notes: 'Pan', subcategory: null, payment_method: 'Bizum', expense_type: 'Fijo' });
    assert.deepEqual(recordToPayload('income', { date: '2026-11-01T00:00:00.000Z', amount: 1500, category: 'Nómina', source: 'Acme', notes: null }), { date: '2026-11-01', amount: '1500.00', category: 'Nómina', notes: null, source: 'Acme' });
    // Intl separa el símbolo con un espacio de no separación.
    assert.equal(movementSummary(record), '12,50 € en Supermercado');
});

test('categorías: se reutiliza la existente aunque cambien mayúsculas o tildes', () => {
    const list = [{ name: 'Nómina' }, { name: 'Supermercado' }];
    assert.equal(findCategory(list, ' supermercado '), 'Supermercado');
    assert.equal(findCategory(list, 'NOMINA'), 'Nómina');
    assert.equal(findCategory(list, 'Ocio'), null);
    assert.equal(findCategory(list, ''), null);
    assert.equal(pickCategory(list, 'supermercado'), 'Supermercado');
    assert.equal(pickCategory(list, 'Borrada'), 'Nómina');
    assert.equal(pickCategory([], 'Ocio'), '');
});
