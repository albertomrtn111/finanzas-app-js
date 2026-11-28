// Exportación de extremo a extremo: el ZIP trae un CSV por tabla y el JSON, los mismos datos.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea un usuario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);

const FILES = ['metadata.json', 'incomes.csv', 'expenses.csv', 'budgets.csv', 'cash_snapshots.csv', 'investments.csv', 'investment_products.csv', 'expense_categories.csv', 'income_categories.csv'];

async function created(res) {
    assert.ok(res.status === 200 || res.status === 201, `${res.status} ${await res.clone().text()}`);
}

async function zipFiles(res) {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]));
}

// Cabecera y filas de un CSV con punto y coma (las filas se comparan enteras: hay campos entre comillas).
function csv(text) {
    const [header, ...rows] = text.split('\n');
    return { header: header.split(';'), rows };
}

function hasRow(table, pattern) {
    assert.ok(table.rows.some(row => pattern.test(row)), `falta una fila como ${pattern} en:\n${table.rows.join('\n')}`);
}

test('exportación: ZIP con un CSV por tabla y JSON con los mismos datos', { skip }, async t => {
    // IP propia: el registro admite 5 altas por hora desde la misma IP.
    const c = httpClient(base, `10.77.${parseInt(run.slice(0, 2), 16) % 250}.${(parseInt(run.slice(2, 4), 16) % 250) + 1}`);
    const email = `export-${run}@nextfinance.test`;
    assert.equal((await c.json('/api/auth/register', 'POST', { email, password: 'clave-export-123', name: 'Exporta', accountMode: 'PERSONAL' })).status, 201);
    assert.equal(await c.login(email, 'clave-export-123'), null);

    await created(await c.json('/api/expenses', 'POST', { date: '2026-11-02', amount: '77.70', category: 'Cena', notes: 'Con "amigos"; y postre' }));
    await created(await c.json('/api/expenses', 'POST', { date: '2026-10-15', amount: '12', category: 'Cena', notes: '=SUMA(A1)' }));
    await created(await c.json('/api/income', 'POST', { date: '2026-11-01', amount: '1500.5', category: 'Nómina', source: 'Empresa' }));
    await created(await c.json('/api/cash', 'POST', { date: '2026-11-03', account: 'Banco', current_value: '999.99' }));
    await created(await c.json('/api/investments', 'POST', { date: '2026-11-04', account: 'Fondo', asset_type: 'Fondos', contribution: '100', current_value: '110' }));
    await created(await c.json('/api/budgets', 'POST', { budgets: [{ category: 'Cena', monthly_amount: '300' }] }));
    await created(await c.json('/api/investment-products', 'POST', { name: 'Fondo', asset_type: 'Fondos' }));

    await t.test('ZIP completo: nombres, orden, cabeceras y filas de cada CSV', async () => {
        const res = await c.request('/api/export?format=zip&scope=all');
        assert.match(res.headers.get('content-disposition'), /^attachment; filename="finanzas-export_completo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip"$/);
        const files = await zipFiles(res);
        assert.deepEqual(Object.keys(files), FILES);

        const metadata = JSON.parse(files['metadata.json']);
        assert.equal(metadata.userEmail, email);
        assert.equal(metadata.scope, 'all');
        assert.equal(metadata.format, 'zip');

        const expenses = csv(files['expenses.csv']);
        assert.deepEqual(expenses.header, ['id', 'date', 'amount', 'category', 'subcategory', 'payment_method', 'expense_type', 'notes']);
        assert.equal(expenses.rows.length, 2);
        // Un campo con ; o comillas va entre comillas; uno que empieza por = se neutraliza con un apóstrofo.
        hasRow(expenses, /^\d+;2026-11-02;77\.7;Cena;[^;]*;[^;]*;[^;]*;"Con ""amigos""; y postre"$/);
        hasRow(expenses, /^\d+;2026-10-15;12;Cena;[^;]*;[^;]*;[^;]*;'=SUMA\(A1\)$/);

        const incomes = csv(files['incomes.csv']);
        assert.deepEqual(incomes.header, ['id', 'date', 'amount', 'category', 'source', 'notes']);
        hasRow(incomes, /^\d+;2026-11-01;1500\.5;Nómina;Empresa;$/);

        const cash = csv(files['cash_snapshots.csv']);
        assert.deepEqual(cash.header, ['id', 'date', 'account', 'current_value', 'notes']);
        hasRow(cash, /^\d+;2026-11-03;Banco;999\.99;$/);

        const investments = csv(files['investments.csv']);
        assert.deepEqual(investments.header, ['id', 'date', 'account', 'asset_type', 'current_value', 'contribution', 'notes']);
        hasRow(investments, /^\d+;2026-11-04;Fondo;Fondos;110;100;$/);

        const budgets = csv(files['budgets.csv']);
        assert.deepEqual(budgets.header, ['id', 'category', 'monthly_amount']);
        hasRow(budgets, /^\d+;Cena;300$/);

        const products = csv(files['investment_products.csv']);
        assert.deepEqual(products.header, ['id', 'name', 'asset_type']);
        hasRow(products, /^\d+;Fondo;Fondos$/);

        hasRow(csv(files['expense_categories.csv']), /^\d+;Cena$/);
        hasRow(csv(files['income_categories.csv']), /^\d+;Nómina$/);
    });

    await t.test('ZIP de un mes: solo los movimientos de ese mes', async () => {
        const res = await c.request('/api/export?format=zip&scope=month&year=2026&month=10');
        assert.match(res.headers.get('content-disposition'), /^attachment; filename="finanzas-export_2026-10_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip"$/);
        const files = await zipFiles(res);
        assert.deepEqual(Object.keys(files), FILES);
        const expenses = csv(files['expenses.csv']);
        assert.equal(expenses.rows.length, 1);
        hasRow(expenses, /^\d+;2026-10-15;12;Cena;/);
        // Sin ingresos en octubre: el CSV queda vacío. Presupuestos y categorías salen completos.
        assert.equal(files['incomes.csv'], '');
        hasRow(csv(files['budgets.csv']), /^\d+;Cena;300$/);
    });

    await t.test('JSON completo con los mismos registros', async () => {
        const res = await c.request('/api/export?format=json&scope=all');
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'application/json');
        assert.match(res.headers.get('content-disposition'), /^attachment; filename="finanzas-export_completo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json"$/);
        const data = await res.json();
        assert.deepEqual(Object.keys(data), ['metadata', 'incomes', 'expenses', 'budgets', 'cash_snapshots', 'investments', 'investment_products', 'expense_categories', 'income_categories']);
        assert.equal(data.metadata.format, 'json');
        // Los importes salen como texto exacto (Decimal), las fechas como AAAA-MM-DD.
        assert.deepEqual(data.expenses.map(e => [e.date, e.amount]).sort(), [['2026-10-15', '12'], ['2026-11-02', '77.7']]);
        assert.deepEqual(data.incomes.map(i => [i.date, i.amount, i.category]), [['2026-11-01', '1500.5', 'Nómina']]);
        assert.deepEqual(data.investments.map(i => [i.current_value, i.contribution]), [['110', '100']]);
        assert.deepEqual(data.budgets.map(b => [b.category, b.monthly_amount]), [['Cena', '300']]);
    });
});
