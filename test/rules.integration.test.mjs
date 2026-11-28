// Reglas de clasificación aprendidas (Tarea NF-4), de extremo a extremo: un movimiento corregido una
// vez se propone bien la siguiente; deshacer una importación deshace lo aprendido; las reglas manuales
// no se pisan; y otro usuario nunca ve ni usa las reglas de A, ni por la web ni por el MCP.
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

// Registro limitado a 5 por hora y dirección: cada usuario sale de una IP distinta.
async function user(label, ipLast) {
    const c = httpClient(base, `10.79.${run.charCodeAt(2) % 200}.${ipLast}`);
    const email = `reglas-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-reglas-123', name: `Reglas ${label}`, accountMode: 'BOTH', businessName: `Empresa ${label} ${run}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal(await c.login(email, 'clave-reglas-123'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    const access = await c.json('/api/user/mcp-tokens', 'POST', { name: 'Pruebas' });
    assert.equal(access.status, 201);
    const { token, url } = await access.json();
    const mcp = new Client({ name: `reglas-${label}`, version: '1.0.0' });
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

const MERCADONA = 'COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA';

test('reglas de clasificación: aprender de las correcciones, deshacer y aislamiento', { skip }, async t => {
    const a = await user('a', 21);
    const b = await user('b', 22);
    t.after(async () => { await a.mcp.close(); await b.mcp.close(); });

    const rulesOf = async who => (await ok(await who.c.request('/api/classification-rules'))).rules;
    const ruleFor = async (who, key) => (await rulesOf(who)).find(rule => rule.merchant_key === key);
    let mercadonaRule;
    let firstImport;

    await t.test('1. una importación clasificada como Supermercado aprende la regla del comercio', async () => {
        const fila = { fecha: '2026-11-05', importe: '-45,30', concepto: MERCADONA, cuenta: 'BBVA' };
        const prep = await call(a.mcp, 'preparar_importacion', { filas: [fila] });
        assert.equal(prep.filas[0].sugerencia, null, 'un usuario nuevo no tiene reglas ni historial');
        firstImport = await call(a.mcp, 'importar_movimientos', { nombre: `BBVA ${run}`, filas: [{ ...fila, destino: 'gasto', category: 'Supermercado', payment_method: 'Tarjeta' }] });
        assert.equal(firstImport.importadas, 1, JSON.stringify(firstImport));
        assert.deepEqual(firstImport.aprendido, { reglas_creadas: 1, reglas_actualizadas: 0 });

        const listed = await call(a.mcp, 'ver_reglas_clasificacion', {});
        assert.equal(listed.total, 1);
        const [rule] = listed.reglas;
        assert.deepEqual(
            [rule.comercio, rule.sentido, rule.destino, rule.category, rule.payment_method, rule.origen, rule.veces, rule.confianza, rule.ejemplo],
            ['mercadona valencia', 'salida', 'gasto', 'Supermercado', 'Tarjeta', 'aprendida', 1, 0.6, MERCADONA],
        );
        mercadonaRule = await ruleFor(a, 'mercadona valencia');
        assert.equal(mercadonaRule.id, rule.id);
        assert.equal(mercadonaRule.origin, 'LEARNED');
        const detail = await call(a.mcp, 'ver_importaciones', { lote: firstImport.lote, incluir_filas: true });
        assert.deepEqual(detail[0].detalle[0].regla, { accion: 'creada', regla_id: rule.id });
    });

    await t.test('2. corregir el movimiento en la web actualiza la regla, en un mismo lote', async () => {
        const [expense] = await ok(await a.c.request(`/api/expenses?q=${encodeURIComponent('MERCADONA')}`));
        assert.equal(expense.category, 'Supermercado');
        const edited = await ok(await a.c.json('/api/expenses', 'PUT', {
            id: expense.id, date: expense.date.slice(0, 10), amount: expense.amount, category: 'Alimentación',
            payment_method: expense.payment_method, expense_type: expense.expense_type, notes: expense.notes,
        }));
        assert.equal(edited.category, 'Alimentación');
        const rule = await ruleFor(a, 'mercadona valencia');
        assert.deepEqual([rule.id, rule.category, rule.payment_method, rule.hits, rule.origin], [mercadonaRule.id, 'Alimentación', 'Tarjeta', 1, 'LEARNED']);

        const history = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 20 });
        const edit = history.find(entry => entry.tool === 'web:gastos:editar' && entry.entity === 'expense');
        const learned = history.find(entry => entry.entity === 'classification_rule' && entry.action === 'LEARN');
        assert.ok(edit && learned, JSON.stringify(history));
        assert.match(edit.batch_id, /^correccion-/);
        assert.equal(learned.batch_id, edit.batch_id);
        assert.equal(learned.tool, 'web:gastos:editar');

        // Cambiar solo el importe no es una corrección de la clasificación: no aprende nada.
        await ok(await a.c.json('/api/expenses', 'PUT', { ...edited, date: edited.date.slice(0, 10), amount: '45.31' }));
        const after = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 20 });
        assert.equal(after.filter(entry => entry.entity === 'classification_rule').length, 1);
        assert.equal(after[0].batch_id, null);
    });

    let secondImport;
    await t.test('3. la siguiente fila del mismo comercio se propone con la categoría corregida', async () => {
        const fila = { fecha: '2026-11-19', importe: -38.1, concepto: `${MERCADONA} 19/11`, cuenta: 'BBVA' };
        const prep = await call(a.mcp, 'preparar_importacion', { filas: [fila] });
        const { sugerencia } = prep.filas[0];
        assert.equal(sugerencia.origen, 'regla');
        assert.equal(sugerencia.regla_id, mercadonaRule.id);
        assert.equal(sugerencia.category, 'Alimentación');
        assert.equal(sugerencia.payment_method, 'Tarjeta');
        assert.equal(sugerencia.destino, 'gasto');
        assert.equal(sugerencia.confianza, 0.6);
        assert.equal(sugerencia.regla_origen, 'aprendida');
        assert.equal(sugerencia.coincidencia, 'exacta');
        assert.ok(sugerencia.alternativas.some(option => option.category === 'Supermercado'), 'el historial queda como alternativa');
        assert.deepEqual(prep.resumen.con_regla, [1]);

        secondImport = await call(a.mcp, 'importar_movimientos', { nombre: `BBVA 2 ${run}`, filas: [{ ...fila, destino: 'gasto', category: 'Alimentación', payment_method: 'Tarjeta' }] });
        assert.equal(secondImport.importadas, 1);
        assert.deepEqual(secondImport.aprendido, { reglas_creadas: 0, reglas_actualizadas: 1 });
        assert.equal((await ruleFor(a, 'mercadona valencia')).hits, 2);
    });

    await t.test('4. deshacer una importación deshace lo que aprendió', async () => {
        const undoSecond = await call(a.mcp, 'deshacer_cambio', { lote: secondImport.lote });
        assert.equal(undoSecond.reverted.length, 2, JSON.stringify(undoSecond));
        const rule = await ruleFor(a, 'mercadona valencia');
        assert.deepEqual([rule.category, rule.hits], ['Alimentación', 1], 'vuelve a como quedó tras la corrección');

        const netflix = await call(a.mcp, 'importar_movimientos', { nombre: `Netflix ${run}`, filas: [{ destino: 'gasto', fecha: '2026-11-12', importe: -12.99, concepto: 'NETFLIX.COM', category: 'Suscripciones' }] });
        assert.deepEqual(netflix.aprendido, { reglas_creadas: 1, reglas_actualizadas: 0 });
        assert.ok(await ruleFor(a, 'netflix'));
        const undoNetflix = await call(a.mcp, 'deshacer_cambio', { lote: netflix.lote });
        assert.equal(undoNetflix.reverted.length, 3, JSON.stringify(undoNetflix));
        assert.equal(await ruleFor(a, 'netflix'), undefined);
        const prep = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: '2026-11-20', importe: -12.99, concepto: 'NETFLIX.COM' }] });
        assert.equal(prep.filas[0].sugerencia, null);

        // Deshacer la corrección de la web (el gasto, la regla y la categoría nueva) devuelve el gasto y
        // la regla a Supermercado. Hace falta forzar porque el importe del gasto cambió después.
        const history = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 20 });
        const correction = history.find(entry => entry.batch_id?.startsWith('correccion-')).batch_id;
        const undoCorrection = await call(a.mcp, 'deshacer_cambio', { lote: correction, forzar: true });
        assert.equal(undoCorrection.reverted.length, 3, JSON.stringify(undoCorrection));
        const [expense] = await ok(await a.c.request(`/api/expenses?q=${encodeURIComponent('MERCADONA')}`));
        assert.equal(expense.category, 'Supermercado');
        assert.equal((await ruleFor(a, 'mercadona valencia')).category, 'Supermercado');
    });

    await t.test('5. una regla manual manda y el aprendizaje no la pisa', async () => {
        const manual = await ok(await a.c.json('/api/classification-rules', 'POST', { merchant: 'Gimnasio Fit', destination: 'EXPENSE', category: 'Deporte', payment_method: 'Domiciliación' }));
        assert.deepEqual([manual.merchant_key, manual.origin, manual.hits, manual.direction], ['gimnasio fit', 'MANUAL', 0, 'OUT']);
        const repeated = await a.c.json('/api/classification-rules', 'POST', { merchant: 'GIMNASIO FIT SL', destination: 'EXPENSE', category: 'Otra' });
        assert.equal(repeated.status, 409);

        const fila = { fecha: '2026-11-02', importe: -39.9, concepto: 'RECIBO GIMNASIO FIT SL NOVIEMBRE' };
        const prep = await call(a.mcp, 'preparar_importacion', { filas: [fila] });
        assert.deepEqual(
            [prep.filas[0].sugerencia.origen, prep.filas[0].sugerencia.regla_id, prep.filas[0].sugerencia.category, prep.filas[0].sugerencia.confianza, prep.filas[0].sugerencia.regla_origen],
            ['regla', manual.id, 'Deporte', 1, 'manual'],
        );
        const imported = await call(a.mcp, 'importar_movimientos', { nombre: `Gimnasio ${run}`, filas: [{ ...fila, destino: 'gasto', category: 'Ocio' }] });
        assert.deepEqual(imported.aprendido, { reglas_creadas: 0, reglas_actualizadas: 0 });
        let rule = await ruleFor(a, 'gimnasio fit');
        assert.deepEqual([rule.category, rule.origin, rule.hits], ['Deporte', 'MANUAL', 0]);

        // Ni una corrección en la web ni desde la IA la cambian; la IA recibe un aviso.
        const [gym] = await ok(await a.c.request(`/api/expenses?q=${encodeURIComponent('GIMNASIO')}`));
        await ok(await a.c.json('/api/expenses', 'PUT', { id: gym.id, date: gym.date.slice(0, 10), amount: gym.amount, category: 'Salud', notes: gym.notes }));
        const fixed = await call(a.mcp, 'guardar_movimiento_personal', { tipo: 'gasto', id: gym.id, category: 'Bienestar' });
        assert.equal(fixed.regla_manual, manual.id);
        assert.match(fixed.aviso, /regla manual/);
        assert.equal(fixed.lote, undefined);
        rule = await ruleFor(a, 'gimnasio fit');
        assert.deepEqual([rule.category, rule.origin], ['Deporte', 'MANUAL']);
        const again = await call(a.mcp, 'preparar_importacion', { filas: [{ ...fila, fecha: '2026-12-02' }] });
        assert.equal(again.filas[0].sugerencia.category, 'Deporte');

        // Editar una aprendida desde la IA la hace manual; deshacerlo la devuelve a aprendida.
        const edited = await call(a.mcp, 'gestionar_regla_clasificacion', { accion: 'editar', id: mercadonaRule.id, category: 'Hogar' });
        assert.deepEqual([edited.accion, edited.regla.origen, edited.regla.category, edited.regla.comercio], ['editada', 'manual', 'Hogar', 'mercadona valencia']);
        const undo = await call(a.mcp, 'deshacer_cambio', { ids: [edited.cambio] });
        assert.equal(undo.reverted.length, 1, JSON.stringify(undo));
        rule = await ruleFor(a, 'mercadona valencia');
        assert.deepEqual([rule.origin, rule.category], ['LEARNED', 'Supermercado']);
    });

    let businessRule;
    let account;
    await t.test('reglas de empresa: solo con empresas y cuentas propias', async () => {
        account = await ok(await a.c.json(`/api/businesses/${a.businessId}/accounts`, 'POST', { name: `Banco ${run}`, kind: 'BANK', opening_balance: '0', opening_on: '2026-01-01' }));
        const created = await call(a.mcp, 'gestionar_regla_clasificacion', { accion: 'crear', comercio: 'Cliente Acme', destino: 'movimiento_empresa', sentido: 'entrada', empresa_id: a.businessId, account_id: account.id });
        assert.equal(created.accion, 'creada', JSON.stringify(created));
        businessRule = created.regla;
        assert.deepEqual([businessRule.comercio, businessRule.empresa_id, businessRule.account_id, businessRule.cuenta, businessRule.flow_type], ['cliente acme', a.businessId, account.id, `Banco ${run}`, 'OPERATING']);
        const prep = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: '2026-11-15', importe: 500, concepto: 'TRANSF RECIBIDA CLIENTE ACME SL F-12' }] });
        assert.deepEqual([prep.filas[0].sugerencia.destino, prep.filas[0].sugerencia.empresa_id, prep.filas[0].sugerencia.account_id], ['movimiento_empresa', a.businessId, account.id]);
        const filtered = await call(a.mcp, 'ver_reglas_clasificacion', { destino: 'movimiento_empresa' });
        assert.deepEqual(filtered.reglas.map(rule => rule.id), [businessRule.id]);
    });

    await t.test('6. B no ve ni usa las reglas de A, ni por la web ni por el MCP', async () => {
        assert.deepEqual(await rulesOf(b), []);
        const listed = await call(b.mcp, 'ver_reglas_clasificacion', { texto: 'mercadona' });
        assert.deepEqual(listed, { total: 0, reglas: [] });
        assert.equal((await call(b.mcp, 'ver_reglas_clasificacion', {})).total, 0);
        const prep = await call(b.mcp, 'preparar_importacion', { filas: [
            { fecha: '2026-11-21', importe: -20, concepto: MERCADONA },
            { fecha: '2026-11-21', importe: -39.9, concepto: 'RECIBO GIMNASIO FIT SL' },
            { fecha: '2026-11-21', importe: 500, concepto: 'TRANSF RECIBIDA CLIENTE ACME SL' },
        ] });
        assert.ok(prep.filas.every(row => row.sugerencia === null), JSON.stringify(prep.filas.map(row => row.sugerencia)));

        const ruleA = await ruleFor(a, 'gimnasio fit');
        assert.equal((await b.c.json('/api/classification-rules', 'PUT', { id: ruleA.id, merchant: 'Robada', destination: 'EXPENSE', category: 'Robada' })).status, 404);
        assert.equal((await b.c.request(`/api/classification-rules?id=${ruleA.id}`, { method: 'DELETE' })).status, 404);
        assert.match((await call(b.mcp, 'gestionar_regla_clasificacion', { accion: 'editar', id: ruleA.id, category: 'Robada' })).error, /No existe la regla/);
        assert.match((await call(b.mcp, 'gestionar_regla_clasificacion', { accion: 'borrar', id: businessRule.id })).error, /No existe la regla/);

        // Ni la empresa ni la cuenta de A, ni mezclando la empresa de B con una cuenta de A.
        const foreignBusiness = await b.c.json('/api/classification-rules', 'POST', { merchant: 'Cliente Robado', destination: 'BUSINESS', direction: 'IN', business_id: a.businessId, account_id: account.id });
        assert.equal(foreignBusiness.status, 404);
        const foreignAccount = await b.c.json('/api/classification-rules', 'POST', { merchant: 'Cliente Robado', destination: 'BUSINESS', direction: 'IN', business_id: b.businessId, account_id: account.id });
        assert.equal(foreignAccount.status, 404);
        assert.match((await call(b.mcp, 'gestionar_regla_clasificacion', { accion: 'crear', comercio: 'Cliente Robado', destino: 'movimiento_empresa', sentido: 'entrada', empresa_id: a.businessId, account_id: account.id })).error, /No existe la empresa/);
        assert.match((await call(b.mcp, 'gestionar_regla_clasificacion', { accion: 'crear', comercio: 'Cliente Robado', destino: 'movimiento_empresa', sentido: 'entrada', empresa_id: b.businessId, account_id: account.id })).error, /no es de esa empresa/);
        assert.ok((await call(b.mcp, 'preparar_importacion', { filas: [{ fecha: '2026-11-21', importe: 1, concepto: 'x' }], empresa_ids: [a.businessId] })).error);

        // Tampoco deshace los cambios de reglas de A.
        const changesA = await call(a.mcp, 'historial_cambios', { entidad: 'classification_rule', limite: 50 });
        assert.ok(changesA.length >= 3);
        assert.equal((await call(b.mcp, 'deshacer_cambio', { ids: changesA.map(entry => entry.id) })).reverted.length, 0);
        assert.deepEqual(await call(b.mcp, 'historial_cambios', { entidad: 'classification_rule', solo_activos: false }), []);

        // Las reglas de A siguen intactas.
        const own = await rulesOf(a);
        assert.deepEqual(own.map(rule => rule.merchant_key).sort(), ['cliente acme', 'gimnasio fit', 'mercadona valencia']);
        assert.equal(own.find(rule => rule.merchant_key === 'gimnasio fit').category, 'Deporte');
    });

    await t.test('la web: página Reglas de clasificación y borrar una regla', async () => {
        assert.equal((await a.c.json('/api/user/onboarding', 'PATCH', { step: 5 })).status, 200);
        const res = await a.c.request('/reglas');
        assert.equal(res.status, 200, res.headers.get('location') || '');
        const html = await res.text();
        assert.match(html, /<title>Reglas de clasificación · NextFinance<\/title>/);
        assert.match(html, /href="\/reglas"/);

        const removed = await a.c.request(`/api/classification-rules?id=${businessRule.id}`, { method: 'DELETE' });
        assert.equal(removed.status, 200);
        assert.equal((await rulesOf(a)).some(rule => rule.id === businessRule.id), false);
        const history = await call(a.mcp, 'historial_cambios', { fuente: 'WEB', entidad: 'classification_rule', limite: 5 });
        const deletion = history.find(entry => entry.tool === 'web:reglas:borrar');
        assert.equal(deletion.before.merchant_key, 'cliente acme');
        const restored = await call(a.mcp, 'deshacer_cambio', { ids: [deletion.id] });
        assert.equal(restored.reverted.length, 1, JSON.stringify(restored));
        assert.ok((await rulesOf(a)).some(rule => rule.id === businessRule.id && rule.account_id === account.id));
        assert.equal((await a.c.request('/api/classification-rules?id=abc', { method: 'DELETE' })).status, 400);
        const anonymous = httpClient(base, `10.79.${run.charCodeAt(2) % 200}.23`);
        assert.equal((await anonymous.request('/api/classification-rules')).status, 401);
    });
});
