import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTITIES, SOURCES, newBatchId, planBudgetReplacement, sameRecord, snapshot, webContext, withoutRelations } from '../src/lib/changeRecords.js';

test('los cambios de la web llevan source WEB y una herramienta web:…', () => {
    assert.deepEqual(webContext(7, 'gastos:crear'), { userId: 7, tool: 'web:gastos:crear', source: 'WEB' });
    assert.ok(webContext(7, 'empresa:movimientos:vincular').tool.length <= 80, 'cabe en change_log.tool');
    assert.deepEqual(Object.keys(SOURCES), ['MCP', 'WEB']);
});

test('cada lote es distinto y lleva su prefijo', () => {
    const a = newBatchId();
    const b = newBatchId();
    assert.match(a, /^web-[0-9a-f-]{36}$/);
    assert.notEqual(a, b);
    assert.match(newBatchId('presupuestos'), /^presupuestos-/);
    assert.ok(a.length <= 80, 'cabe en change_log.batch_id');
});

test('sameRecord no tiene en cuenta updated_at, los vínculos ni el orden de las claves', () => {
    const before = { id: 1, amount: '10.00', date: new Date('2026-11-02T00:00:00.000Z'), updated_at: new Date('2026-11-02T10:00:00Z'), tax_lines: [{ base: '10', vat_rate: 21 }] };
    const later = { tax_lines: [{ vat_rate: 21, base: '10' }], date: '2026-11-02T00:00:00.000Z', amount: '10.00', id: 1, updated_at: new Date('2026-11-28T10:00:00Z'), allocations: [{ id: 3 }] };
    assert.equal(sameRecord(later, before), true);
    assert.equal(sameRecord({ ...later, amount: '11.00' }, before), false);
});

test('snapshot hace una copia JSON fiel', () => {
    assert.equal(snapshot(null), null);
    assert.equal(snapshot(undefined), null);
    assert.deepEqual(snapshot({ date: new Date('2026-01-01T00:00:00Z'), n: 1 }), { date: '2026-01-01T00:00:00.000Z', n: 1 });
});

test('guardar todos los presupuestos solo toca los que cambian', () => {
    const existing = [
        { id: 1, category: 'Casa', monthly_amount: '500.00' },
        { id: 2, category: 'Ocio', monthly_amount: '100.00' },
        { id: 3, category: 'Coche', monthly_amount: '80.00' },
    ];
    const plan = planBudgetReplacement(existing, [
        { category: 'Casa', monthly_amount: '500' },
        { category: 'Ocio', monthly_amount: '120.5' },
        { category: 'Comida', monthly_amount: '300' },
    ]);
    assert.deepEqual(plan.removed.map(b => b.id), [3]);
    assert.deepEqual(plan.changed, [{ before: existing[1], monthly_amount: '120.5' }]);
    assert.deepEqual(plan.added, [{ category: 'Comida', monthly_amount: '300' }]);

    const empty = planBudgetReplacement(existing, []);
    assert.equal(empty.removed.length, 3);
    assert.deepEqual([empty.changed, empty.added], [[], []]);
    assert.deepEqual(planBudgetReplacement([], []), { removed: [], changed: [], added: [] });
});

test('withoutRelations deja solo la fila', () => {
    const row = { id: 1, description: 'Factura', _count: { allocations: 0 }, allocations: [], attachments: [] };
    assert.deepEqual(withoutRelations(row), { id: 1, description: 'Factura' });
    assert.ok(row._count, 'no cambia el original');
});

test('las entidades de la web son las que el MCP sabe deshacer', () => {
    for (const entity of ['expense', 'income', 'cash_snapshot', 'investment', 'investment_product', 'budget', 'expense_category', 'income_category', 'business_activity', 'business_movement', 'business_account', 'business_cash_plan', 'business_budget', 'business_movement_links']) {
        assert.ok(ENTITIES[entity], entity);
    }
});
