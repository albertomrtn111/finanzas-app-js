// Los cambios hechos desde la web quedan en el registro de cambios igual que los del MCP:
// la IA los lista con historial_cambios (source WEB) y los deshace con deshacer_cambio.
// Necesita AUTH_TEST_URL y una base de datos de pruebas: crea usuarios y accesos MCP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { client as httpClient } from './helpers/httpClient.mjs';

const base = process.env.AUTH_TEST_URL;
const skip = !base;
const run = randomUUID().slice(0, 8);
const MARK = `WEBLOG-${run}`;

// Registro limitado a 5 por hora y dirección: cada usuario sale de una IP distinta.
async function user(label, ipLast) {
    const c = httpClient(base, `10.77.${run.charCodeAt(1) % 200}.${ipLast}`);
    const email = `weblog-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-registro-123', name: `Registro ${label}`, accountMode: 'BOTH', businessName: `Empresa ${label} ${run}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal(await c.login(email, 'clave-registro-123'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    const access = await c.json('/api/user/mcp-tokens', 'POST', { name: 'Pruebas' });
    assert.equal(access.status, 201);
    const { token, url } = await access.json();
    assert.ok(token && url, 'el acceso MCP trae token y url');
    const mcp = new Client({ name: `registro-web-${label}`, version: '1.0.0' });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return { c, mcp, businessId: business.id };
}

async function call(mcp, name, args = {}) {
    const result = await mcp.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? '';
    if (result.isError) return { error: text };
    return JSON.parse(text);
}

async function ok(res) {
    assert.ok(res.status === 200 || res.status === 201, `${res.status} ${await res.clone().text()}`);
    return res.json();
}

test('web: cada cambio queda en el registro y la IA lo puede deshacer', { skip }, async t => {
    const a = await user('a', 11);
    const b = await user('b', 12);
    t.after(async () => { await a.mcp.close(); await b.mcp.close(); });

    const category = `Comida ${run}`;
    const oldName = `Renombrar ${run}`;
    const newName = `Renombrada ${run}`;
    const expenses = async () => (await ok(await a.c.request(`/api/expenses?q=${encodeURIComponent(MARK)}`)));
    const budgets = async () => Object.fromEntries((await ok(await a.c.request('/api/budgets'))).map(row => [row.category, row.monthly_amount]));

    // Gasto: crear, editar y borrar.
    const expense = await ok(await a.c.json('/api/expenses', 'POST', { date: '2026-11-03', amount: '12.34', category, notes: MARK }));
    const edited = await ok(await a.c.json('/api/expenses', 'PUT', { id: expense.id, date: '2026-11-03', amount: '20.00', category, notes: MARK }));
    assert.equal(edited.amount, '20');
    assert.equal((await a.c.request(`/api/expenses?id=${expense.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await expenses()).length, 0);

    // Presupuestos: dos guardados de la lista entera; el segundo cambia, borra y crea.
    await ok(await a.c.json('/api/budgets', 'POST', { budgets: [{ category, monthly_amount: '100' }, { category: `Ocio ${run}`, monthly_amount: '50' }] }));
    await ok(await a.c.json('/api/budgets', 'POST', { budgets: [{ category, monthly_amount: '150' }, { category: `Viajes ${run}`, monthly_amount: '70' }] }));
    assert.deepEqual(await budgets(), { [category]: '150', [`Viajes ${run}`]: '70' });

    // Categoría: renombrar una en uso.
    const kept = await ok(await a.c.json('/api/expenses', 'POST', { date: '2026-11-04', amount: '5', category: oldName, notes: MARK }));
    await ok(await a.c.json('/api/categories', 'PUT', { type: 'expense', oldName, newName }));

    // Empresa: cuenta, factura, cobro vinculado, desvincular, borrar el cobro y la factura.
    const biz = `/api/businesses/${a.businessId}`;
    const account = await ok(await a.c.json(`${biz}/accounts`, 'POST', { name: `Banco ${run}`, kind: 'BANK', opening_balance: '0', opening_on: '2026-01-01' }));
    const activity = await ok(await a.c.json(`${biz}/activities`, 'POST', { direction: 'INCOME', description: MARK, category: 'Servicios', occurred_on: '2026-11-03', tax_lines: [{ base: 100, vat_rate: 0 }] }));
    const movement = await ok(await a.c.json(`${biz}/movements`, 'POST', { date: '2026-11-03', amount: '100', description: `Cobro ${MARK}`, direction: 'IN', account_id: account.id, allocations: [{ activity_id: activity.id, amount: '100' }] }));
    await ok(await a.c.json(`${biz}/movements`, 'PATCH', { id: movement.id, allocations: [] }));
    assert.equal((await a.c.request(`${biz}/movements?id=${movement.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await a.c.request(`${biz}/activities?id=${activity.id}`, { method: 'DELETE' })).status, 200);

    const history = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 200 });
    const find = (tool, entity, entityId) => history.find(entry => entry.tool === tool && entry.entity === entity && (entityId === undefined || entry.entity_id === entityId));

    await t.test('historial_cambios lista los cambios de la web con su origen', async () => {
        assert.ok(history.length >= 15, `hay ${history.length} cambios`);
        assert.ok(history.every(entry => entry.source === 'WEB' && entry.origen === 'web'));
        assert.ok(find('web:gastos:crear', 'expense', expense.id));
        assert.ok(find('web:gastos:crear', 'expense_category'), 'la categoría nueva también queda');
        assert.equal(find('web:gastos:editar', 'expense', expense.id).after.amount, '20');
        assert.equal(find('web:gastos:borrar', 'expense', expense.id).before.notes, MARK);
        const saves = history.filter(entry => entry.tool === 'web:presupuestos:guardar');
        assert.equal(new Set(saves.map(entry => entry.batch_id)).size, 2, 'cada guardado es un lote');
        assert.ok(saves.every(entry => /^web-[0-9a-f-]{36}$/.test(entry.batch_id)));
        assert.deepEqual(find('web:categorias:renombrar', 'expense_category').after, { name: newName });
        assert.ok(find('web:empresa:cuentas:crear', 'business_account', account.id));
        assert.ok(find('web:empresa:operaciones:crear', 'business_activity', activity.id));
        assert.equal(find('web:empresa:movimientos:crear', 'business_movement', movement.id).business_id, a.businessId);
        assert.equal(find('web:empresa:movimientos:vincular', 'business_movement_links', movement.id).before.length, 1);
        assert.equal(find('web:empresa:movimientos:borrar', 'business_movement', movement.id).before.allocations.length, 0);
        assert.ok(find('web:empresa:operaciones:borrar', 'business_activity', activity.id));
        const mcpOnly = await call(a.mcp, 'historial_cambios', { fuente: 'MCP' });
        assert.deepEqual(mcpOnly, []);
    });

    await t.test('otro usuario no ve ni deshace los cambios web de A', async () => {
        const others = await call(b.mcp, 'historial_cambios', { limite: 200, solo_activos: false });
        assert.equal(JSON.stringify(others).includes(MARK), false);
        assert.ok(others.every(entry => !history.some(own => own.id === entry.id)));
        const byId = await call(b.mcp, 'deshacer_cambio', { ids: history.map(entry => entry.id) });
        assert.equal(byId.reverted.length, 0);
        const batch = history.find(entry => entry.tool === 'web:presupuestos:guardar').batch_id;
        assert.equal((await call(b.mcp, 'deshacer_cambio', { lote: batch })).reverted.length, 0);
        assert.equal((await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 200 })).length, history.length, 'siguen todos pendientes');
    });

    await t.test('deshacer por id recupera el gasto borrado y su importe anterior', async () => {
        const restored = await call(a.mcp, 'deshacer_cambio', { ids: [find('web:gastos:borrar', 'expense', expense.id).id] });
        assert.equal(restored.reverted.length, 1, JSON.stringify(restored));
        let rows = await expenses();
        assert.equal(rows.find(row => row.id === expense.id)?.amount, '20');
        const undoEdit = await call(a.mcp, 'deshacer_cambio', { ids: [find('web:gastos:editar', 'expense', expense.id).id] });
        assert.equal(undoEdit.reverted.length, 1, JSON.stringify(undoEdit));
        rows = await expenses();
        assert.equal(rows.find(row => row.id === expense.id)?.amount, '12.34');
    });

    await t.test('deshacer por lote devuelve los presupuestos al guardado anterior', async () => {
        const second = history.find(entry => entry.tool === 'web:presupuestos:guardar' && entry.action === 'DELETE').batch_id;
        const undo = await call(a.mcp, 'deshacer_cambio', { lote: second });
        assert.equal(undo.reverted.length, 3, JSON.stringify(undo));
        assert.deepEqual(await budgets(), { [category]: '100', [`Ocio ${run}`]: '50' });
    });

    await t.test('deshacer un renombrado devuelve el nombre a la categoría y a sus gastos', async () => {
        const undo = await call(a.mcp, 'deshacer_cambio', { ids: [find('web:categorias:renombrar', 'expense_category').id] });
        assert.equal(undo.reverted.length, 1, JSON.stringify(undo));
        const names = (await ok(await a.c.request('/api/categories?type=expense'))).map(row => row.name);
        assert.ok(names.includes(oldName) && !names.includes(newName), names.join(', '));
        assert.equal((await expenses()).find(row => row.id === kept.id)?.category, oldName);
    });

    await t.test('deshacer de una vez el borrado de la factura y del cobro y la desvinculación', async () => {
        const ids = [
            find('web:empresa:operaciones:borrar', 'business_activity', activity.id).id,
            find('web:empresa:movimientos:borrar', 'business_movement', movement.id).id,
            find('web:empresa:movimientos:vincular', 'business_movement_links', movement.id).id,
        ];
        const undo = await call(a.mcp, 'deshacer_cambio', { ids });
        assert.equal(undo.reverted.length, 3, JSON.stringify(undo));
        const activities = await ok(await a.c.request(`${biz}/activities`));
        const back = activities.find(row => row.id === activity.id);
        assert.equal(back?.description, MARK);
        assert.deepEqual(back.allocations.map(link => [link.movement_id, link.amount]), [[movement.id, '100']]);
        const movements = await ok(await a.c.request(`${biz}/movements`));
        assert.equal(movements.find(row => row.id === movement.id)?.allocations.length, 1);
        const left = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 200 });
        // Deshechos: gasto (2), presupuestos (3), renombrado (1) y empresa (3).
        assert.equal(left.length, history.length - 9, 'los deshechos ya no salen como activos');
    });
});
