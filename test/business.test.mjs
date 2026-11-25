import test from 'node:test';
import assert from 'node:assert/strict';
import { activityInput, cents, closedQuarterMessage, closedQuartersTouched, isClosedQuarter, percent, summarizeBusiness } from '../src/lib/business.js';

test('separa base, IVA deducible, retención y total de una factura externa', () => {
    const result = activityInput({
        direction: 'EXPENSE', description: 'Servicio', category: 'Servicios', occurred_on: '2026-10-02', due_on: '2026-10-20',
        document_kind: 'INVOICE', document_number: 'F-1', document_date: '2026-10-02', counterparty_name: 'Proveedor',
        withholding_rate: 15,
        tax_lines: [{ base: '100.00', vat_rate: 21, deductible_percent: 50 }]
    });
    assert.equal(result.error, undefined);
    assert.equal(result.value.base_amount, '100.00');
    assert.equal(result.value.vat_amount, '21.00');
    assert.equal(result.value.deductible_vat, '10.50');
    assert.equal(result.value.withholding_amount, '15.00');
    assert.equal(result.value.total_amount, '106.00');
    assert.equal(result.value.vat_period, '2026-Q4');
});

test('un gasto sin factura no genera IVA deducible', () => {
    const result = activityInput({
        direction: 'EXPENSE', description: 'Servicio pendiente', category: 'Servicios', occurred_on: '2026-10-02',
        document_kind: 'NONE', tax_lines: [{ base: '100', vat_rate: 21 }]
    });
    assert.match(result.error, /Sin factura/);
});

test('resultado, caja, pendientes y previsión son cifras distintas', () => {
    const summary = summarizeBusiness({
        accounts: [{ id: 1, name: 'Banco', opening_balance: '1000.00' }],
        activities: [
            { direction: 'EXPENSE', occurred_on: '2026-10-02', due_on: '2026-10-20', base_amount: '100.00', vat_amount: '21.00', deductible_vat: '21.00', total_amount: '121.00', vat_period: '2026-Q4', document_kind: 'INVOICE', allocations: [{ amount: '60.00' }] },
            { direction: 'INCOME', occurred_on: '2026-10-03', due_on: '2026-10-22', base_amount: '300.00', vat_amount: '63.00', deductible_vat: '0.00', total_amount: '363.00', vat_period: '2026-Q4', document_kind: 'INVOICE', allocations: [] }
        ],
        movements: [
            { account_id: 1, date: '2026-10-04', amount: '-60.00', flow_type: 'OPERATING' },
            { account_id: 1, date: '2026-10-04', amount: '200.00', flow_type: 'OPERATING' },
            { account_id: 1, date: '2026-10-04', amount: '-50.00', flow_type: 'TRANSFER' },
            { account_id: 1, date: '2026-10-04', amount: '50.00', flow_type: 'TRANSFER' }
        ],
        plans: [{ due_on: '2026-10-25', direction: 'EXPENSE', amount: '40.00', status: 'PLANNED' }]
    }, new Date('2026-10-05T00:00:00Z'));
    assert.equal(summary.liquid, '1140.00');
    assert.deepEqual(summary.accrued, { income: '300.00', expense: '100.00', result: '200.00' });
    assert.equal(summary.monthFlow, '140.00');
    assert.deepEqual(summary.pending, { income: '363.00', expense: '61.00', overdue: '0.00' });
    assert.equal(summary.projected30, '1402.00');
    assert.deepEqual(summary.vat, { period: '2026-Q4', output: '63.00', deductible: '21.00', difference: '42.00' });
});

test('el IVA no deducible aumenta el gasto de gestión', () => {
    const result = summarizeBusiness({
        accounts: [], movements: [], plans: [],
        activities: [{ direction: 'EXPENSE', occurred_on: '2026-10-01', due_on: null, base_amount: '100.00', vat_amount: '21.00', deductible_vat: '10.50', total_amount: '121.00', vat_period: '2026-Q4', document_kind: 'INVOICE', allocations: [] }]
    }, new Date('2026-10-05T00:00:00Z'));
    assert.equal(result.accrued.expense, '110.50');
    assert.equal(cents('110.50'), 11050);
});

const invoice = (overrides = {}) => ({
    direction: 'EXPENSE', description: 'Servicio', category: 'Servicios', occurred_on: '2026-07-10',
    document_kind: 'INVOICE', document_number: 'F-9', document_date: '2026-07-10', counterparty_name: 'Proveedor',
    tax_lines: [{ base: '100', vat_rate: 21 }], ...overrides,
});

test('un pendiente sin vencimiento cuenta en la previsión desde su devengo', () => {
    const summary = summarizeBusiness({
        accounts: [{ id: 1, name: 'Banco', opening_balance: '1000.00' }], movements: [], plans: [],
        activities: [
            { direction: 'EXPENSE', occurred_on: '2026-10-01', due_on: null, base_amount: '500.00', vat_amount: '0.00', deductible_vat: '0.00', total_amount: '500.00', document_kind: 'NONE', allocations: [] },
            { direction: 'INCOME', occurred_on: '2026-10-04', due_on: null, base_amount: '200.00', vat_amount: '0.00', deductible_vat: '0.00', total_amount: '200.00', document_kind: 'NONE', allocations: [{ amount: '50.00' }] },
        ],
    }, new Date('2026-10-05T00:00:00Z'));
    assert.deepEqual(summary.pending, { income: '150.00', expense: '500.00', overdue: '650.00' });
    assert.equal(summary.projected30, '650.00');
    assert.equal(summary.projected90, '650.00');
});

test('los importes se leen de forma estricta', () => {
    for (const bad of [true, false, '0x1F', [5], {}, null, undefined, '', '1e3', 1e21, '12.345', 12.345, '12.', '.5', 'Infinity', NaN, '1.234,56', '5 €']) {
        assert.equal(cents(bad), null, `${JSON.stringify(bad) ?? String(bad)} no es un importe`);
    }
    assert.equal(cents('12,5'), 1250);
    assert.equal(cents(' 12.50 '), 1250);
    assert.equal(cents(12.5), 1250);
    assert.equal(cents('+500'), 50000);
    assert.equal(cents('-3', { allowNegative: true }), -300);
    assert.equal(cents('-3'), null);
    assert.equal(cents('0'), null);
    assert.equal(cents('0', { allowZero: true }), 0);
    assert.equal(cents({ toFixed: () => '1060.5', isFinite: () => true }), 106050, 'acepta un Decimal de Prisma');
    assert.equal(percent('5,2'), 5.2);
    assert.equal(percent(true), null);
    assert.equal(percent('101'), null);
});

test('la operación rechaza importes y tipos de IVA inválidos con un mensaje claro', () => {
    assert.match(activityInput(invoice({ tax_lines: [{ base: true, vat_rate: 21 }] })).error, /Base imponible inválida/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '0x1F', vat_rate: 21 }] })).error, /Base imponible inválida/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: [5], vat_rate: 21 }] })).error, /Base imponible inválida/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '100', vat_rate: null }] })).error, /Tipo de IVA inválido/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '100', vat_rate: true }] })).error, /Tipo de IVA inválido/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '100', vat_rate: '21' }, { base: '5', vat_rate: '' }] })).error, /Tipo de IVA de la línea 2 inválido/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '100', vat_rate: 21, deductible_percent: true }] })).error, /IVA deducible inválido/);
    assert.match(activityInput(invoice({ tax_lines: [null] })).error, /línea de importes 1/);
    assert.match(activityInput(invoice({ withholding_rate: true })).error, /Retención inválida/);
    assert.match(activityInput(invoice({ tax_lines: [{ base: '100', vat_rate: 21, vat_treatment: 'EXEMPT' }] })).error, /exenta o no sujeta/);
    // Sin tipo indicado se admite el 0 % solo donde no cabe otro.
    assert.equal(activityInput(invoice({ tax_lines: [{ base: '100', vat_treatment: 'EXEMPT' }] })).value.vat_amount, '0.00');
    assert.equal(activityInput(invoice({ document_kind: 'NONE', document_number: '', document_date: '', tax_lines: [{ base: '100' }] })).value.total_amount, '100.00');
    assert.equal(activityInput(invoice({ withholding_rate: '' })).value.withholding_amount, '0.00');
    assert.equal(activityInput(invoice({ tax_lines: [{ base: '100,50', vat_rate: '10' }] })).value.total_amount, '110.55');
});

test('el período de IVA no puede ser anterior al trimestre de la factura', () => {
    assert.equal(activityInput(invoice()).value.vat_period, '2026-Q3');
    assert.equal(activityInput(invoice({ vat_period: '2026-Q4' })).value.vat_period, '2026-Q4');
    assert.match(activityInput(invoice({ vat_period: '2026-Q2' })).error, /2026-Q2 es anterior al trimestre de la fecha de factura \(2026-Q3\)/);
    assert.match(activityInput(invoice({ vat_period: '2025-Q4' })).error, /anterior/);
    assert.match(activityInput(invoice({ vat_period: '2026-Q5' })).error, /Período de IVA inválido/);
    assert.match(activityInput(invoice({ vat_period: 42 })).error, /Período de IVA inválido/);
});

test('cambiar o borrar facturas de trimestres cerrados se detecta', () => {
    const today = '2026-11-24';
    assert.equal(isClosedQuarter('2026-Q3', today), true);
    assert.equal(isClosedQuarter('2026-Q4', today), false);
    assert.equal(isClosedQuarter(null, today), false);
    // Lo guardado viene de la base de datos: fechas, Decimal y líneas con otro orden de claves (JSONB).
    const stored = { ...activityInput(invoice()).value, document_date: new Date('2026-07-10T00:00:00Z'), occurred_on: new Date('2026-07-10T00:00:00Z'), base_amount: { toFixed: () => '100', isFinite: () => true } };
    stored.tax_lines = stored.tax_lines.map(line => Object.fromEntries(Object.entries(line).reverse()));
    assert.deepEqual(closedQuartersTouched(stored, null, today), ['2026-Q3']);
    assert.deepEqual(closedQuartersTouched(stored, activityInput(invoice({ description: 'Otro concepto', category: 'Otra', due_on: '2026-12-01' })).value, today), []);
    assert.deepEqual(closedQuartersTouched(stored, activityInput(invoice({ tax_lines: [{ base: '120', vat_rate: 21 }] })).value, today), ['2026-Q3']);
    assert.deepEqual(closedQuartersTouched(stored, activityInput(invoice({ vat_period: '2026-Q4' })).value, today), ['2026-Q3']);
    const open = activityInput(invoice({ occurred_on: '2026-11-02', document_date: '2026-11-02' })).value;
    assert.deepEqual(closedQuartersTouched(open, null, today), []);
    assert.deepEqual(closedQuartersTouched(open, activityInput(invoice({ document_date: '2026-04-02', occurred_on: '2026-04-02' })).value, today), ['2026-Q2']);
    assert.deepEqual(closedQuartersTouched({ ...stored, document_kind: 'NONE', vat_period: null }, null, today), []);
    assert.match(closedQuarterMessage(['2026-Q3'], 'borrar'), /trimestre de IVA 2026-Q3, que ya ha terminado y puede estar declarado\. Borrarla/);
});
