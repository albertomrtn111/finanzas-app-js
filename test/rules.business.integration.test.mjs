// Reglas de clasificación (Tarea NF-4), segunda parte, de extremo a extremo: arranque en frío con las
// categorías del usuario, fijo o variable como corrección, correcciones de empresa (vincular facturas y
// cambiar la categoría de una operación) que enseñan la regla y se deshacen, y la página de reglas de
// cada empresa con su API, aisladas por usuario y abiertas también a una cuenta solo de empresa.
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
// Una IP distinta por usuario: el registro admite 5 por hora y por IP.
const ip = n => `10.83.${run.charCodeAt(3) % 200}.${n}`;

// Fechas de hoy hacia atrás en España: las importaciones no admiten fechas futuras.
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const daysAgo = n => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

async function user(label, n, accountMode = 'BOTH') {
    const c = httpClient(base, ip(n));
    const email = `reglas-empresa-${label}-${run}@nextfinance.test`;
    const res = await c.json('/api/auth/register', 'POST', { email, password: 'clave-reglas-456', name: `Reglas ${label}`, accountMode, businessName: `Empresa ${label} ${run}`, businessKind: 'SELF_EMPLOYED' });
    assert.equal(res.status, 201, await res.clone().text());
    assert.equal(await c.login(email, 'clave-reglas-456'), null);
    const [business] = await (await c.request('/api/businesses')).json();
    if (accountMode === 'COMPANY') return { c, businessId: business.id };
    assert.equal((await c.json('/api/user/onboarding', 'PATCH', { step: 5 })).status, 200);
    const access = await c.json('/api/user/mcp-tokens', 'POST', { name: 'Pruebas' });
    assert.equal(access.status, 201);
    const { token, url } = await access.json();
    const mcp = new Client({ name: `reglas-empresa-${label}`, version: '1.0.0' });
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

const ADOBE = 'COMPRA TARJ. 4111XXXXXXXX9876 ADOBE CREATIVE CLOUD IE';
const GYM = 'RECIBO GIMNASIO VITAL SL';

test('reglas: arranque en frío, fijo o variable y correcciones de empresa', { skip }, async t => {
    const a = await user('a', 31);
    const b = await user('b', 32);
    t.after(async () => { await a.mcp.close(); await b.mcp.close(); });
    const biz = `/api/businesses/${a.businessId}`;
    const rulesOf = async (who, query = '') => (await ok(await who.c.request(`/api/classification-rules${query}`))).rules;
    const ruleFor = async (who, key) => (await rulesOf(who)).find(rule => rule.merchant_key === key);
    const webHistory = async () => call(a.mcp, 'historial_cambios', { fuente: 'WEB', limite: 40 });
    const activity = (description, category, amount, direction = 'EXPENSE') => ({ direction, description, category, occurred_on: today, tax_lines: [{ base: amount, vat_rate: 0 }] });

    let bank1;
    let bank2;
    await t.test('1. arranque en frío: sin reglas ni historial, ninguna sugerencia y las categorías del usuario', async () => {
        for (const [name, type] of [['Supermercado', 'expense'], ['Ocio', 'expense'], ['Nómina', 'income']]) {
            await ok(await a.c.json('/api/categories', 'POST', { name, type }));
        }
        bank1 = await ok(await a.c.json(`${biz}/accounts`, 'POST', { name: `Banco 1 ${run}`, kind: 'BANK', opening_balance: '0', opening_on: '2026-01-01' }));
        bank2 = await ok(await a.c.json(`${biz}/accounts`, 'POST', { name: `Banco 2 ${run}`, kind: 'BANK', opening_balance: '0', opening_on: '2026-01-01' }));
        // Operaciones de empresa ya registradas: dan las categorías de empresa, pero no son historial de extractos.
        await ok(await a.c.json(`${biz}/activities`, 'POST', activity('Material de oficina', 'Oficina', 20)));
        await ok(await a.c.json(`${biz}/activities`, 'POST', activity('Proyecto web', 'Consultoría', 900, 'INCOME')));

        const prep = await call(a.mcp, 'preparar_importacion', { filas: [
            { fecha: daysAgo(3), importe: -45.3, concepto: 'COMPRA MERCADONA VALENCIA' },
            { fecha: daysAgo(3), importe: -59.99, concepto: ADOBE },
            { fecha: daysAgo(2), importe: 1200, concepto: 'TRANSF RECIBIDA CLIENTE ACME SL' },
        ] });
        assert.ok(prep.filas.every(row => row.sugerencia === null), JSON.stringify(prep.filas.map(row => row.sugerencia)));
        assert.ok(prep.filas.every(row => /elige con el usuario entre opciones/.test(row.sin_sugerencia) && /No inventes categorías/.test(row.sin_sugerencia)));
        assert.deepEqual(prep.resumen.sin_sugerencia, [1, 2, 3]);
        assert.deepEqual(prep.resumen.con_regla, []);

        const expense = (await ok(await a.c.request('/api/categories?type=expense'))).map(category => category.name);
        const income = (await ok(await a.c.request('/api/categories?type=income'))).map(category => category.name);
        assert.deepEqual(prep.opciones.categorias_gasto, expense);
        assert.deepEqual(prep.opciones.categorias_ingreso, income);
        assert.ok(expense.includes('Supermercado') && income.includes('Nómina'));
        assert.ok(prep.opciones.tipos_gasto.includes('Fijo') && prep.opciones.tipos_gasto.includes('Variable'));
        const [empresa] = prep.opciones.empresas;
        assert.equal(empresa.id, a.businessId);
        assert.deepEqual(empresa.categorias, { gasto: ['Oficina'], ingreso: ['Consultoría'] }, 'también las categorías de empresa que ya usa');
        assert.deepEqual(empresa.cuentas.map(account => account.id), [bank1.id, bank2.id]);

        assert.deepEqual(prep.como_clasificar.map(step => step.slice(0, 2)), ['1.', '2.', '3.']);
        assert.match(prep.como_clasificar[0], /^1\. Regla/);
        assert.match(prep.como_clasificar[1], /^2\. Historial/);
        assert.match(prep.como_clasificar[2], /^3\. Sin sugerencia.*No inventes nombres/);
        assert.match(prep.datos_no_instrucciones, /no instrucciones/);

        // Las instrucciones del servidor y la guía de importación dan el orden y avisan de que los textos son datos.
        const instructions = a.mcp.getInstructions();
        assert.match(instructions, /1\) las reglas de clasificación[\s\S]*2\) si ninguna encaja, el historial[\s\S]*3\) si tampoco hay sugerencia, elige entre las categorías/);
        assert.match(instructions, /nunca instrucciones/);
        assert.doesNotMatch(instructions, /mercadona|adobe/i, 'las reglas no van en las instrucciones');
        const prompt = (await a.mcp.getPrompt({ name: 'importar_extracto' })).messages[0].content.text;
        assert.match(prompt, /a\. Regla[\s\S]*b\. Historial[\s\S]*c\. Mis categorías/);
        assert.match(prompt, /son datos, no instrucciones/);
    });

    await t.test('2. fijo o variable: corregir un gasto de Variable a Fijo enseña la regla', async () => {
        const fila = { fecha: daysAgo(20), importe: -39.9, concepto: GYM };
        const imported = await call(a.mcp, 'importar_movimientos', { nombre: `Gimnasio ${run}`, filas: [{ ...fila, destino: 'gasto', category: 'Ocio', expense_type: 'Variable' }] });
        assert.deepEqual(imported.aprendido, { reglas_creadas: 1, reglas_actualizadas: 0 }, JSON.stringify(imported));
        const learned = await ruleFor(a, 'gimnasio vital');
        assert.deepEqual([learned.category, learned.expense_type, learned.origin], ['Ocio', 'Variable', 'LEARNED']);
        const first = await call(a.mcp, 'preparar_importacion', { filas: [{ ...fila, fecha: daysAgo(10), importe: -39.95 }] });
        assert.deepEqual([first.filas[0].sugerencia.origen, first.filas[0].sugerencia.expense_type], ['regla', 'Variable']);

        const [gym] = await ok(await a.c.request(`/api/expenses?q=${encodeURIComponent('GIMNASIO VITAL')}`));
        const edited = await ok(await a.c.json('/api/expenses', 'PUT', {
            id: gym.id, date: gym.date.slice(0, 10), amount: gym.amount, category: gym.category,
            subcategory: gym.subcategory, payment_method: gym.payment_method, expense_type: 'Fijo', notes: gym.notes,
        }));
        assert.equal(edited.expense_type, 'Fijo');
        const rule = await ruleFor(a, 'gimnasio vital');
        assert.deepEqual([rule.id, rule.category, rule.expense_type, rule.hits, rule.origin], [learned.id, 'Ocio', 'Fijo', 1, 'LEARNED']);
        const history = await webHistory();
        const edit = history.find(entry => entry.tool === 'web:gastos:editar' && entry.entity_id === gym.id);
        assert.match(edit.batch_id, /^correccion-/);
        assert.ok(history.some(entry => entry.entity === 'classification_rule' && entry.action === 'LEARN' && entry.batch_id === edit.batch_id));

        const next = await call(a.mcp, 'preparar_importacion', { filas: [{ ...fila, fecha: daysAgo(1), importe: -39.97 }] });
        const { sugerencia } = next.filas[0];
        assert.deepEqual([sugerencia.origen, sugerencia.regla_id, sugerencia.category, sugerencia.expense_type], ['regla', learned.id, 'Ocio', 'Fijo']);

        // Desde la IA también cuenta, y deshacerlo devuelve la regla a Fijo.
        const back = await call(a.mcp, 'guardar_movimiento_personal', { tipo: 'gasto', id: gym.id, expense_type: 'Variable' });
        assert.deepEqual(back.aprendido, { reglas_creadas: 0, reglas_actualizadas: 1 }, JSON.stringify(back));
        assert.equal((await ruleFor(a, 'gimnasio vital')).expense_type, 'Variable');
        assert.equal((await call(a.mcp, 'deshacer_cambio', { lote: back.lote })).reverted.length, 2);
        assert.equal((await ruleFor(a, 'gimnasio vital')).expense_type, 'Fijo');
    });

    let adobeRule;
    let invoice;
    let operationBatch;
    await t.test('3. empresa: la cuenta corregida al importar y la categoría corregida en la web se proponen la próxima vez', async () => {
        const first = await call(a.mcp, 'importar_movimientos', { nombre: `Adobe 1 ${run}`, filas: [{ destino: 'movimiento_empresa', fecha: daysAgo(40), importe: -59.99, concepto: ADOBE, empresa_id: a.businessId, account_id: bank1.id }] });
        assert.deepEqual(first.aprendido, { reglas_creadas: 1, reglas_actualizadas: 0 }, JSON.stringify(first));
        adobeRule = await ruleFor(a, 'adobe creative');
        assert.deepEqual([adobeRule.destination, adobeRule.business_id, adobeRule.account_id, adobeRule.category], ['BUSINESS', a.businessId, bank1.id, null]);

        // El usuario corrige la cuenta al importar la siguiente.
        const proposed = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: daysAgo(10), importe: -59.98, concepto: ADOBE }] });
        assert.equal(proposed.filas[0].sugerencia.account_id, bank1.id);
        const second = await call(a.mcp, 'importar_movimientos', { nombre: `Adobe 2 ${run}`, filas: [{ destino: 'movimiento_empresa', fecha: daysAgo(10), importe: -59.98, concepto: ADOBE, empresa_id: a.businessId, account_id: bank2.id }] });
        assert.deepEqual(second.aprendido, { reglas_creadas: 0, reglas_actualizadas: 1 });
        assert.equal((await ruleFor(a, 'adobe creative')).account_id, bank2.id);

        // En la web: registra la factura y vincula el pago con ella.
        invoice = await ok(await a.c.json(`${biz}/activities`, 'POST', activity('Licencia Adobe', 'Software', 59.98)));
        const movements = await ok(await a.c.request(`${biz}/movements?accountId=${bank2.id}`));
        const payment = movements.find(movement => movement.description === ADOBE);
        await ok(await a.c.json(`${biz}/movements`, 'PATCH', { id: payment.id, allocations: [{ activity_id: invoice.id, amount: '59.98' }] }));
        let rule = await ruleFor(a, 'adobe creative');
        assert.deepEqual([rule.id, rule.account_id, rule.category, rule.origin], [adobeRule.id, bank2.id, 'Software', 'LEARNED']);
        let history = await webHistory();
        const link = history.find(entry => entry.tool === 'web:empresa:movimientos:vincular');
        assert.match(link.batch_id, /^correccion-/);
        assert.ok(history.some(entry => entry.entity === 'classification_rule' && entry.batch_id === link.batch_id));

        let next = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: daysAgo(1), importe: -59.97, concepto: `${ADOBE} ${daysAgo(1)}` }] });
        let { sugerencia } = next.filas[0];
        assert.deepEqual(
            [sugerencia.origen, sugerencia.regla_id, sugerencia.destino, sugerencia.empresa_id, sugerencia.account_id, sugerencia.category],
            ['regla', adobeRule.id, 'movimiento_empresa', a.businessId, bank2.id, 'Software'],
        );

        // Cambiar la categoría de la factura ya pagada también corrige la regla, en el mismo lote.
        await ok(await a.c.json(`${biz}/activities`, 'PATCH', { ...activity('Licencia Adobe', 'Licencias', 59.98), id: invoice.id }));
        rule = await ruleFor(a, 'adobe creative');
        assert.deepEqual([rule.account_id, rule.category], [bank2.id, 'Licencias']);
        history = await webHistory();
        const operation = history.find(entry => entry.tool === 'web:empresa:operaciones:editar' && entry.entity_id === invoice.id);
        assert.match(operation.batch_id, /^correccion-/);
        assert.ok(history.some(entry => entry.entity === 'classification_rule' && entry.action === 'LEARN' && entry.batch_id === operation.batch_id));
        operationBatch = operation.batch_id;
        next = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: daysAgo(1), importe: -59.97, concepto: ADOBE }] });
        ({ sugerencia } = next.filas[0]);
        assert.deepEqual([sugerencia.account_id, sugerencia.category], [bank2.id, 'Licencias']);

        // Cambiar solo el concepto de la factura no es una corrección de la clasificación.
        await ok(await a.c.json(`${biz}/activities`, 'PATCH', { ...activity('Licencia Adobe anual', 'Licencias', 59.98), id: invoice.id }));
        history = await webHistory();
        assert.equal(history.find(entry => entry.tool === 'web:empresa:operaciones:editar').batch_id, null);
        await ok(await a.c.json(`${biz}/activities`, 'PATCH', { ...activity('Licencia Adobe', 'Licencias', 59.98), id: invoice.id }));
    });

    await t.test('4. deshacer una corrección de empresa deshace lo aprendido', async () => {
        const undo = await call(a.mcp, 'deshacer_cambio', { lote: operationBatch, forzar: true });
        assert.equal(undo.reverted.length, 2, JSON.stringify(undo));
        const rule = await ruleFor(a, 'adobe creative');
        assert.deepEqual([rule.account_id, rule.category], [bank2.id, 'Software']);
        const activities = await ok(await a.c.request(`${biz}/activities`));
        assert.equal(activities.find(item => item.id === invoice.id).category, 'Software');
        const next = await call(a.mcp, 'preparar_importacion', { filas: [{ fecha: daysAgo(1), importe: -59.97, concepto: ADOBE }] });
        assert.equal(next.filas[0].sugerencia.category, 'Software');

        // Desde la IA: guardar_operacion_empresa enseña y devuelve el lote para deshacerlo.
        const fixed = await call(a.mcp, 'guardar_operacion_empresa', { empresa_id: a.businessId, id: invoice.id, category: 'Diseño' });
        assert.deepEqual(fixed.aprendido, { reglas_creadas: 0, reglas_actualizadas: 1 }, JSON.stringify(fixed));
        assert.match(fixed.lote, /^correccion-/);
        assert.equal((await ruleFor(a, 'adobe creative')).category, 'Diseño');
        assert.equal((await call(a.mcp, 'deshacer_cambio', { lote: fixed.lote })).reverted.length, 2);
        assert.equal((await ruleFor(a, 'adobe creative')).category, 'Software');
        const renamed = await call(a.mcp, 'guardar_operacion_empresa', { empresa_id: a.businessId, id: invoice.id, description: 'Licencia Adobe CC' });
        assert.equal(renamed.lote, undefined, 'sin cambiar la categoría no se aprende nada');
    });

    let manualRule;
    await t.test('5. empresa: una fila que salda una factura aprende su categoría y las reglas manuales no se pisan', async () => {
        const advice = await ok(await a.c.json(`${biz}/activities`, 'POST', activity('Asesoría fiscal', 'Asesoría', 100)));
        const imported = await call(a.mcp, 'importar_movimientos', { nombre: `Gestoría ${run}`, filas: [{
            destino: 'movimiento_empresa', fecha: daysAgo(5), importe: -100, concepto: 'RECIBO GESTORIA LOPEZ', empresa_id: a.businessId, account_id: bank1.id,
            category: 'Otra', allocations: [{ activity_id: advice.id, amount: 100 }],
        }] });
        assert.deepEqual(imported.aprendido, { reglas_creadas: 1, reglas_actualizadas: 0 }, JSON.stringify(imported));
        const rule = await ruleFor(a, 'gestoria lopez');
        assert.deepEqual([rule.account_id, rule.category], [bank1.id, 'Asesoría'], 'manda la categoría de la factura que salda');

        manualRule = await ok(await a.c.json(`/api/classification-rules?businessId=${a.businessId}`, 'POST', { merchant: 'Hosting Nube', direction: 'OUT', account_id: bank1.id, flow_type: 'OPERATING', category: 'Servidores' }));
        assert.deepEqual([manualRule.destination, manualRule.business_id, manualRule.origin, manualRule.category], ['BUSINESS', a.businessId, 'MANUAL', 'Servidores']);
        const hosting = await call(a.mcp, 'importar_movimientos', { nombre: `Hosting ${run}`, filas: [{ destino: 'movimiento_empresa', fecha: daysAgo(4), importe: -15, concepto: 'PAGO HOSTING NUBE SL', empresa_id: a.businessId, account_id: bank2.id }] });
        assert.deepEqual(hosting.aprendido, { reglas_creadas: 0, reglas_actualizadas: 0 });
        const server = await ok(await a.c.json(`${biz}/activities`, 'POST', activity('Servidor noviembre', 'Software', 15)));
        const movement = (await ok(await a.c.request(`${biz}/movements?accountId=${bank2.id}`))).find(item => item.description === 'PAGO HOSTING NUBE SL');
        const linked = await call(a.mcp, 'vincular_movimiento_empresa', { empresa_id: a.businessId, movimiento_id: movement.id, allocations: [{ activity_id: server.id, amount: 15 }] });
        assert.deepEqual(linked.reglas_manuales, [manualRule.id], JSON.stringify(linked));
        assert.match(linked.aviso, /regla manual/);
        assert.equal(linked.lote, undefined);
        const after = await ruleFor(a, 'hosting nube');
        assert.deepEqual([after.account_id, after.category, after.origin], [bank1.id, 'Servidores', 'MANUAL']);
    });

    await t.test('6. la página de reglas de la empresa y su API, aisladas por usuario', async () => {
        const res = await a.c.request(`/empresa/${a.businessId}/reglas`);
        assert.equal(res.status, 200, res.headers.get('location') || '');
        const html = await res.text();
        assert.match(html, /<title>Reglas de clasificación · NextFinance<\/title>/);
        assert.ok(html.includes(`href="/empresa/${a.businessId}/reglas"`), 'enlace en el menú de la empresa');

        const scoped = await ok(await a.c.request(`/api/classification-rules?businessId=${a.businessId}`));
        assert.equal(scoped.businessId, a.businessId);
        assert.equal(scoped.personal, false);
        assert.ok(scoped.rules.length >= 3 && scoped.rules.every(rule => rule.destination === 'BUSINESS' && rule.business_id === a.businessId));
        assert.ok(!scoped.rules.some(rule => rule.merchant_key === 'gimnasio vital'), 'sin las reglas personales');
        assert.deepEqual(scoped.businesses.map(item => item.id), [a.businessId]);
        assert.ok(scoped.businesses[0].categories.expense.includes('Software'));
        assert.deepEqual(scoped.categories, { expense: [], income: [] });

        // En la página de una empresa, la regla siempre es de esa empresa.
        const created = await ok(await a.c.json(`/api/classification-rules?businessId=${a.businessId}`, 'POST', { merchant: 'Papeleria Sol', destination: 'EXPENSE', direction: 'OUT', category: 'Material', account_id: bank1.id }));
        assert.deepEqual([created.destination, created.business_id, created.account_id, created.category], ['BUSINESS', a.businessId, bank1.id, 'Material']);
        const edited = await ok(await a.c.json(`/api/classification-rules?businessId=${a.businessId}`, 'PUT', { id: adobeRule.id, merchant: 'adobe creative', direction: 'OUT', account_id: bank1.id, flow_type: 'OPERATING', category: 'Software' }));
        assert.deepEqual([edited.account_id, edited.origin], [bank1.id, 'MANUAL']);
        const gym = await ruleFor(a, 'gimnasio vital');
        assert.equal((await a.c.json(`/api/classification-rules?businessId=${a.businessId}`, 'PUT', { id: gym.id, merchant: 'Gimnasio', account_id: bank1.id, direction: 'OUT' })).status, 404, 'una regla personal no se toca desde la empresa');
        assert.equal((await a.c.request(`/api/classification-rules?businessId=${a.businessId}&id=${gym.id}`, { method: 'DELETE' })).status, 404);
        assert.ok(await ruleFor(a, 'gimnasio vital'));
        assert.equal((await a.c.request(`/api/classification-rules?businessId=${a.businessId}&id=${created.id}`, { method: 'DELETE' })).status, 200);
        const removal = (await webHistory()).find(entry => entry.tool === 'web:empresa:reglas:borrar');
        assert.equal(removal.entity_id, created.id);

        // B no ve ni toca nada de la empresa de A.
        assert.equal((await b.c.request(`/api/classification-rules?businessId=${a.businessId}`)).status, 404);
        assert.equal((await b.c.request(`/empresa/${a.businessId}/reglas`)).status, 404);
        assert.equal((await b.c.json(`/api/classification-rules?businessId=${b.businessId}`, 'PUT', { id: adobeRule.id, merchant: 'Robada', direction: 'OUT', account_id: bank1.id })).status, 404);
        assert.equal((await b.c.request(`/api/classification-rules?businessId=${b.businessId}&id=${adobeRule.id}`, { method: 'DELETE' })).status, 404);
        assert.equal((await b.c.request(`/api/classification-rules?businessId=${a.businessId}&id=${adobeRule.id}`, { method: 'DELETE' })).status, 404);
        assert.equal((await b.c.json(`/api/classification-rules?businessId=${b.businessId}`, 'POST', { merchant: 'Robada', direction: 'OUT', account_id: bank1.id })).status, 404, 'ni con una cuenta de A');
        assert.deepEqual((await ok(await b.c.request(`/api/classification-rules?businessId=${b.businessId}`))).rules, []);
        assert.equal((await b.c.request('/api/classification-rules?businessId=abc')).status, 404);
        assert.ok(await ruleFor(a, 'adobe creative'));
        const anonymous = httpClient(base, ip(34));
        assert.equal((await anonymous.request(`/api/classification-rules?businessId=${a.businessId}`)).status, 401);

        // Una cuenta solo de empresa no puede abrir /reglas, pero sí las reglas de su empresa.
        const company = await user('c', 33, 'COMPANY');
        const personalPage = await company.c.request('/reglas');
        assert.ok([303, 307, 308].includes(personalPage.status), String(personalPage.status));
        assert.match(personalPage.headers.get('location') || '', /\/empresa$/);
        const own = await company.c.request(`/empresa/${company.businessId}/reglas`);
        assert.equal(own.status, 200, own.headers.get('location') || '');
        assert.match(await own.text(), /<title>Reglas de clasificación · NextFinance<\/title>/);
        const account = await ok(await company.c.json(`/api/businesses/${company.businessId}/accounts`, 'POST', { name: 'Caja', kind: 'CASH', opening_balance: '0', opening_on: '2026-01-01' }));
        const rule = await ok(await company.c.json(`/api/classification-rules?businessId=${company.businessId}`, 'POST', { merchant: 'Cliente Beta', direction: 'IN', account_id: account.id }));
        assert.deepEqual([rule.business_id, rule.direction, rule.category], [company.businessId, 'IN', null]);
        const listed = await ok(await company.c.request(`/api/classification-rules?businessId=${company.businessId}`));
        assert.deepEqual(listed.rules.map(item => item.id), [rule.id]);
        assert.equal((await company.c.request(`/api/classification-rules?businessId=${a.businessId}`)).status, 404);
    });
});
