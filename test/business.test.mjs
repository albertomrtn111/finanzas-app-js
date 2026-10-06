import test from 'node:test';
import assert from 'node:assert/strict';
import { activityInput, cents, summarizeBusiness } from '../src/lib/business.js';

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
