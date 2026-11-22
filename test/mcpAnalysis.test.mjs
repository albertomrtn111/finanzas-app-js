import test from 'node:test';
import assert from 'node:assert/strict';
import { monthsInRange, netWorth, personalSummary, previousRange } from '../src/lib/mcp/analysis.js';
import { bearerToken, generateToken, hashToken } from '../src/lib/mcp/tokens.js';
import { plain } from '../src/lib/mcp/serialize.js';

const d = value => new Date(`${value}T00:00:00.000Z`);

test('meses y periodo anterior', () => {
    assert.deepEqual(monthsInRange('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
    assert.deepEqual(previousRange('2026-11-01', '2026-11-30'), { from: '2026-10-02', to: '2026-10-31' });
});

test('resumen: desviación sobre el presupuesto de todos los meses del periodo', () => {
    const summary = personalSummary({
        expenses: [
            { id: 1, date: d('2026-10-03'), amount: '300.00', category: 'Comida' },
            { id: 2, date: d('2026-11-03'), amount: '350.50', category: 'Comida' },
            { id: 3, date: d('2026-11-04'), amount: '20.00', category: 'Ocio' },
        ],
        incomes: [{ id: 1, date: d('2026-11-01'), amount: '2000', category: 'Nómina' }],
        budgets: [{ category: 'Comida', monthly_amount: '300' }, { category: 'Casa', monthly_amount: '500' }],
        from: '2026-10-01', to: '2026-11-30',
    });
    const food = summary.por_categoria.find(c => c.categoria === 'Comida');
    assert.equal(food.presupuesto, 600);
    assert.equal(food.desviacion, 50.5);
    assert.equal(food.desviacion_pct, 8.4);
    assert.deepEqual(summary.categorias_sin_presupuesto, ['Ocio']);
    assert.equal(summary.por_categoria.find(c => c.categoria === 'Casa').gastado, 0);
    assert.equal(summary.ahorro, 1329.5);
    assert.equal(summary.por_mes.length, 2);
});

test('patrimonio: último dato por cuenta y aportaciones acumuladas', () => {
    const worth = netWorth({
        cash: [
            { id: 1, date: d('2026-10-01'), account: 'Banco', current_value: '1000' },
            { id: 2, date: d('2026-11-01'), account: 'Banco', current_value: '1200' },
            { id: 3, date: d('2026-12-01'), account: 'Banco', current_value: '9999' },
        ],
        investments: [
            { id: 1, date: d('2026-10-01'), account: 'Fondo', asset_type: 'Fondos', contribution: '500', current_value: '500' },
            { id: 2, date: d('2026-11-01'), account: 'Fondo', asset_type: 'Fondos', contribution: '500', current_value: '1100' },
        ],
        through: '2026-11-15',
    });
    assert.equal(worth.liquido, 1200);
    assert.equal(worth.invertido, 1100);
    assert.equal(worth.aportado, 1000);
    assert.equal(worth.rentabilidad_pct, 10);
    assert.equal(worth.patrimonio_total, 2300);
});

test('tokens: formato, hash estable y lectura de la cabecera', () => {
    const token = generateToken();
    assert.match(token, /^nf_[A-Za-z0-9_-]{43}$/);
    assert.equal(hashToken(token), hashToken(token));
    assert.equal(hashToken(token).length, 64);
    const request = new Request('http://x', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(bearerToken(request), token);
    assert.equal(bearerToken(new Request('http://x', { headers: { Authorization: 'Bearer otro' } })), null);
});

test('fechas sin hora se muestran como AAAA-MM-DD', () => {
    assert.deepEqual(plain({ date: d('2026-11-05'), created_at: new Date('2026-11-05T10:00:00.000Z') }), { date: '2026-11-05', created_at: '2026-11-05T10:00:00.000Z' });
});
