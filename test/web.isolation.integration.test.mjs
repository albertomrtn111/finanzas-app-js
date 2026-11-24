// Aislamiento entre usuarios en las rutas de la web (el MCP tiene su propia prueba).
// Con la sesión de B se intenta leer, cambiar y borrar lo de A; lo de A tiene que seguir intacto.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea usuarios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
const MARK = `SOLO-A-${run}`;

async function user(label, ipLast) {
    const c = httpClient(base, `10.88.${run.charCodeAt(0) % 200}.${ipLast}`);
    const email = `web-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-web-123', name: `Web ${label}`, accountMode: 'BOTH', businessName: `Empresa ${label}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(res.status, 201);
    assert.equal(await c.login(email, 'clave-web-123'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    return { c, businessId: business.id };
}

async function created(res) {
    assert.ok(res.status === 200 || res.status === 201, `${res.status} ${await res.clone().text()}`);
    return res.json();
}

const idOf = record => record?.id ?? record?.data?.id ?? record?.record?.id;

test('web: cada usuario solo ve y escribe sus datos', { skip }, async t => {
    const a = await user('a', 1);
    const b = await user('b', 2);

    // Datos de A.
    const expense = idOf(await created(await a.c.json('/api/expenses', 'POST', { date: '2026-11-02', amount: '77.70', category: 'PrivadoA', notes: MARK })));
    const income = idOf(await created(await a.c.json('/api/income', 'POST', { date: '2026-11-02', amount: '1234', category: 'NominaA', source: MARK })));
    const cash = idOf(await created(await a.c.json('/api/cash', 'POST', { date: '2026-11-02', account: `Banco ${MARK}`, current_value: '999' })));
    const investment = idOf(await created(await a.c.json('/api/investments', 'POST', { date: '2026-11-02', account: `Fondo ${MARK}`, asset_type: 'Fondos', contribution: '100', current_value: '110' })));
    await created(await a.c.json('/api/budgets', 'POST', { budgets: [{ category: 'PrivadoA', monthly_amount: '300' }] }));
    const activity = idOf(await created(await a.c.json(`/api/businesses/${a.businessId}/activities`, 'POST', { direction: 'EXPENSE', description: MARK, category: 'Material', occurred_on: '2026-11-02', tax_lines: [{ base: 10, vat_rate: 0 }] })));
    for (const id of [expense, income, cash, investment, activity]) assert.ok(id, 'la API devuelve el id creado');

    await t.test('lecturas: B no ve nada de A', async () => {
        for (const path of ['/api/expenses', '/api/income', '/api/cash', '/api/investments', '/api/budgets', '/api/categories?type=expense', '/api/categories?type=income', '/api/investment-products', '/api/summary?year=2026&period=month&month=11', '/api/export?format=json&scope=all']) {
            const res = await b.c.request(path);
            assert.equal(res.status, 200, path);
            const text = await res.text();
            assert.equal(text.includes(MARK) || text.includes('PrivadoA') || text.includes('NominaA'), false, path);
        }
        for (const path of ['', '/activities', '/movements', '/accounts', '/summary', '/plans', '/budgets', '/vat-export?period=2026-Q4']) {
            assert.equal((await b.c.request(`/api/businesses/${a.businessId}${path}`)).status, 404, `empresa${path}`);
        }
    });

    await t.test('escrituras: B no puede cambiar ni borrar lo de A', async () => {
        const attempts = [
            ['/api/expenses', 'PUT', { id: expense, date: '2026-11-02', amount: '1', category: 'Robado' }],
            ['/api/income', 'PUT', { id: income, date: '2026-11-02', amount: '1', category: 'Robado' }],
            ['/api/cash', 'PUT', { id: cash, date: '2026-11-02', account: 'Robado', current_value: '1' }],
            ['/api/investments', 'PUT', { id: investment, date: '2026-11-02', account: 'Robado', asset_type: 'Fondos', contribution: '1', current_value: '1' }],
            [`/api/businesses/${a.businessId}/activities`, 'PATCH', { id: activity, direction: 'EXPENSE', description: 'Robado', category: 'Material', occurred_on: '2026-11-02', tax_lines: [{ base: 1, vat_rate: 0 }] }],
            [`/api/businesses/${b.businessId}/activities`, 'PATCH', { id: activity, direction: 'EXPENSE', description: 'Robado', category: 'Material', occurred_on: '2026-11-02', tax_lines: [{ base: 1, vat_rate: 0 }] }],
        ];
        for (const [path, method, body] of attempts) {
            const res = await b.c.json(path, method, body);
            assert.ok(res.status >= 400 && res.status < 500, `${method} ${path} → ${res.status}`);
        }
        for (const [path, id] of [['/api/expenses', expense], ['/api/income', income], ['/api/cash', cash], ['/api/investments', investment], [`/api/businesses/${a.businessId}/activities`, activity], [`/api/businesses/${b.businessId}/activities`, activity]]) {
            const res = await b.c.request(`${path}?id=${id}`, { method: 'DELETE' });
            assert.ok(res.status >= 400 && res.status < 500, `DELETE ${path} → ${res.status}`);
        }
        const rename = await b.c.json('/api/categories', 'PUT', { type: 'expense', oldName: 'PrivadoA', newName: 'Robado' });
        assert.ok(rename.status >= 400, `renombrar → ${rename.status}`);
    });

    await t.test('los datos de A siguen intactos', async () => {
        const all = await (await a.c.request('/api/export?format=json&scope=all')).text();
        assert.ok(all.includes(MARK));
        assert.equal(all.includes('Robado'), false);
        assert.ok(all.includes('77.7'));
        const activities = await (await a.c.request(`/api/businesses/${a.businessId}/activities`)).text();
        assert.ok(activities.includes(MARK));
        assert.equal(activities.includes('Robado'), false);
    });
});
