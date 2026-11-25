import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildInversionesView, buildPatrimonioView, firstRecordDate, monthlyWealthSeries, normalizeRecords,
    parseWindow, returnPct, wealthAt,
} from '../src/lib/wealth.js';
import { netWorth } from '../src/lib/mcp/analysis.js';

const d = value => new Date(`${value}T00:00:00.000Z`);
let nextId = 1;
const saldo = (date, account, value) => ({ id: nextId++, date: d(date), account, current_value: value });
const inversion = (date, account, contribution, value, asset_type = 'Fondos') => ({
    id: nextId++, date: d(date), account, asset_type, contribution, current_value: value,
});

test('sin datos: todo a cero, sin serie ni variaciones', () => {
    const now = wealthAt({ cash: [], investments: [], through: '2026-11-25' });
    assert.equal(now.totalCents, 0);
    assert.deepEqual(now.products, []);
    assert.deepEqual(monthlyWealthSeries({ cash: [], investments: [], through: '2026-11-25' }), []);
    assert.equal(firstRecordDate({}), null);

    const view = buildPatrimonioView({ today: '2026-11-25' });
    assert.equal(view.hasData, false);
    assert.equal(view.total, 0);
    assert.equal(view.sinceStart, null);
    assert.equal(view.yearChange, null);
    assert.deepEqual(view.series, []);

    const inv = buildInversionesView({ today: '2026-11-25' });
    assert.equal(inv.hasData, false);
    assert.equal(inv.health, null);
    assert.equal(inv.returnPct, null);
});

test('la aportación es de cada registro (no acumulada) y el valor, el del último registro', () => {
    // Fondo: aporta 1000, luego solo actualiza valor, luego aporta 500 y luego retira 200.
    const investments = [
        inversion('2026-01-10', 'Fondo', '1000.00', '1000.00'),
        inversion('2026-02-28', 'Fondo', '0', '1080.50'),
        inversion('2026-03-15', 'Fondo', '500', '1600.10'),
        inversion('2026-04-20', 'Fondo', '-200', '1450.20'),
    ];
    const now = wealthAt({ investments, through: '2026-11-25' });
    assert.equal(now.contributedCents, 130000); // 1000 + 0 + 500 − 200
    assert.equal(now.investedCents, 145020);
    assert.equal(now.gainCents, 15020);
    assert.equal(now.products[0].returnPct, 11.6); // 150,20 / 1300
});

test('un solo producto: céntimos exactos sin errores de coma flotante', () => {
    const investments = [inversion('2026-05-01', 'ETF', '0.10', '0.10'), inversion('2026-05-02', 'ETF', '0.20', '0.30')];
    const now = wealthAt({ investments, through: '2026-05-31' });
    assert.equal(now.contributedCents, 30);
    assert.equal(now.investedCents, 30);
    assert.equal(now.gainCents, 0);
});

test('a igual fecha manda el registro de mayor id', () => {
    const cash = [{ id: 9, date: d('2026-10-04'), account: 'Banco', current_value: '150' }, { id: 7, date: d('2026-10-04'), account: 'Banco', current_value: '100' }];
    assert.equal(wealthAt({ cash, through: '2026-10-31' }).cashCents, 15000);
});

test('los registros con fecha futura no cuentan hasta su fecha', () => {
    const cash = [saldo('2026-10-01', 'Banco', '100'), saldo('2026-12-01', 'Banco', '900')];
    const view = buildPatrimonioView({ cash, today: '2026-11-25' });
    assert.equal(view.cash, 100);
    assert.equal(view.futureRecords, 1);
});

test('filas sin cuenta o con fecha inválida se descartan', () => {
    const rows = normalizeRecords([{ id: 1, date: 'no es fecha', account: 'X', current_value: '1' }, { id: 2, date: d('2026-01-01'), account: ' ', current_value: '1' }, saldo('2026-01-02', 'Ok', '5')]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account, 'Ok');
});

test('serie mensual: arrastra el último valor en los meses sin datos (huecos entre fechas)', () => {
    const cash = [saldo('2026-01-15', 'Banco', '1000'), saldo('2026-04-10', 'Banco', '1500')];
    const investments = [inversion('2026-02-01', 'Fondo', '300', '300'), inversion('2026-05-20', 'Fondo', '0', '360')];
    const series = monthlyWealthSeries({ cash, investments, through: '2026-06-12' });
    assert.deepEqual(series.map(p => p.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    assert.deepEqual(series.map(p => p.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-12']);
    assert.deepEqual(series.map(p => p.cashCents), [100000, 100000, 100000, 150000, 150000, 150000]);
    assert.deepEqual(series.map(p => p.investedCents), [0, 30000, 30000, 30000, 36000, 36000]);
    assert.deepEqual(series.map(p => p.contributedCents), [0, 30000, 30000, 30000, 30000, 30000]);
    assert.deepEqual(series.map(p => p.totalCents), [100000, 130000, 130000, 180000, 186000, 186000]);
});

test('serie mensual: la ventana recorta el principio pero nunca empieza antes del primer dato', () => {
    const cash = [saldo('2024-03-01', 'Banco', '10'), saldo('2026-11-01', 'Banco', '20')];
    const last12 = monthlyWealthSeries({ cash, through: '2026-11-25', months: 12 });
    assert.equal(last12.length, 12);
    assert.equal(last12[0].month, '2025-12');
    assert.equal(last12[0].cashCents, 1000); // arrastra el saldo de 2024
    assert.equal(last12.at(-1).cashCents, 2000);
    assert.equal(monthlyWealthSeries({ cash, through: '2026-11-25' }).length, 33);
    const recent = [saldo('2026-10-05', 'Banco', '10')];
    assert.equal(monthlyWealthSeries({ cash: recent, through: '2026-11-25', months: 12 }).length, 2);
});

test('coincide con ver_patrimonio del MCP en totales y por producto', () => {
    const cash = [saldo('2026-01-31', 'Banco', '2500.55'), saldo('2026-03-31', 'Banco', '2300'), saldo('2026-02-01', 'Caja', '40.10')];
    const investments = [
        inversion('2026-01-10', 'Fondo indexado', '1000', '1000', 'Fondos'),
        inversion('2026-03-01', 'Fondo indexado', '250', '1302.33', 'Fondos'),
        inversion('2026-02-10', 'Acciones X', '800', '760.40', 'Acciones'),
    ];
    for (const through of ['2026-02-15', '2026-11-25']) {
        const mine = wealthAt({ cash, investments, through });
        const mcp = netWorth({ cash, investments, through });
        assert.equal(mine.totalCents / 100, mcp.patrimonio_total);
        assert.equal(mine.cashCents / 100, mcp.liquido);
        assert.equal(mine.investedCents / 100, mcp.invertido);
        assert.equal(mine.contributedCents / 100, mcp.aportado);
        assert.equal(mine.gainCents / 100, mcp.plusvalia);
        for (const product of mcp.inversiones) {
            const own = mine.products.find(p => p.account === product.producto);
            assert.equal(own.contributedCents / 100, product.aportado);
            assert.equal(own.gainCents / 100, product.plusvalia);
        }
    }
});

test('rentabilidad: solo con capital aportado positivo', () => {
    assert.equal(returnPct(500, 10000), 5);
    assert.equal(returnPct(500, 0), null);
    assert.equal(returnPct(500, -100), null);
});

test('vista de patrimonio: pesos, variación en el año y desde el primer mes', () => {
    const cash = [saldo('2025-06-10', 'Banco', '1000'), saldo('2025-12-20', 'Banco', '2000'), saldo('2026-11-01', 'Banco', '3000')];
    const investments = [inversion('2026-02-01', 'ETF', '1000', '1000', 'ETF')];
    const view = buildPatrimonioView({ cash, investments, today: '2026-11-25', months: 12 });
    assert.equal(view.total, 4000);
    assert.equal(view.investedSharePct, 25);
    assert.deepEqual(view.yearChange, { date: '2025-12-31', base: 2000, change: 2000, changePct: 100 });
    assert.deepEqual(view.sinceStart, { date: '2025-06-30', base: 1000, change: 3000, changePct: 300 });
    assert.deepEqual(view.accounts.map(a => [a.type, a.account, a.weightPct]), [['Efectivo', 'Banco', 75], ['Inversión', 'ETF', 25]]);
    assert.equal(view.series.length, 12);
    assert.equal(view.series.at(-1).total, 4000);
});

test('vista de patrimonio: sin variación si el primer mes es el actual', () => {
    const view = buildPatrimonioView({ cash: [saldo('2026-11-02', 'Banco', '100')], today: '2026-11-25' });
    assert.equal(view.sinceStart, null);
    assert.equal(view.yearChange, null);
});

test('vista de inversiones: posiciones cerradas, salud de la cartera y reparto por tipo', () => {
    const investments = [
        inversion('2026-01-10', 'Fondo', '1000', '1000', 'Fondos'),
        inversion('2026-06-10', 'Fondo', '0', '1200', 'Fondos'),
        inversion('2026-01-10', 'Cripto', '500', '500', 'Cripto'),
        inversion('2026-07-01', 'Cripto', '-650', '0', 'Cripto'), // vendida con 150 € de beneficio
    ];
    const view = buildInversionesView({ investments, today: '2026-11-25' });
    assert.equal(view.contributed, 850);
    assert.equal(view.value, 1200);
    assert.equal(view.gain, 350);
    assert.equal(view.positions, 1);
    assert.equal(view.productCount, 2);
    assert.equal(view.health.diversification.label, 'Baja');
    assert.equal(view.health.concentration.label, 'Alta');
    assert.deepEqual(view.byAssetType, [{ name: 'Fondos', value: 1200, sharePct: 100 }]);
    const closed = view.products.find(p => p.account === 'Cripto');
    assert.equal(closed.closed, true);
    assert.equal(closed.gain, 150);
    assert.equal(closed.returnPct, null);
    assert.deepEqual(view.series.map(p => p.month).slice(0, 2), ['2026-01', '2026-02']);
});

test('ventana de la evolución desde la URL', () => {
    assert.deepEqual(parseWindow(undefined), { value: '12', months: 12 });
    assert.deepEqual(parseWindow('36'), { value: '36', months: 36 });
    assert.deepEqual(parseWindow('todo'), { value: 'todo', months: null });
    assert.deepEqual(parseWindow(['24', '5']), { value: '24', months: 24 });
    assert.deepEqual(parseWindow('0'), { value: '12', months: 12 });
    assert.deepEqual(parseWindow('9999'), { value: '12', months: 12 });
    assert.deepEqual(parseWindow('abc'), { value: '12', months: 12 });
});
