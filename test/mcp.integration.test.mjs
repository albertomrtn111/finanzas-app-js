// Prueba de extremo a extremo del MCP contra una app en marcha y una base de datos de pruebas.
// Se salta si no se indican MCP_TEST_URL y MCP_TEST_TOKEN (y MCP_TEST_FOREIGN_BUSINESS para el aislamiento).
// Nunca la ejecutes contra la base de datos real: crea y borra registros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.MCP_TEST_URL;
const token = process.env.MCP_TEST_TOKEN;
const foreignBusiness = Number(process.env.MCP_TEST_FOREIGN_BUSINESS || 0);
const skip = !url || !token;

async function connect() {
    const client = new Client({ name: 'pruebas', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
}

async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? '';
    if (result.isError) return { error: text };
    return JSON.parse(text);
}

test('MCP de extremo a extremo', { skip }, async t => {
    await t.test('rechaza peticiones sin token o con token inválido', async () => {
        const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
        assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 401);
        assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Authorization: 'Bearer nf_falso' }, body })).status, 401);
    });

    const client = await connect();
    t.after(() => client.close());

    await t.test('expone todas las herramientas con anotaciones', async () => {
        const { tools } = await client.listTools();
        const names = tools.map(tool => tool.name);
        for (const name of ['ver_contexto', 'resumen_personal', 'guardar_movimiento_personal', 'registrar_movimiento_empresa', 'deshacer_cambio']) assert.ok(names.includes(name), name);
        assert.ok(tools.every(tool => tool.annotations && typeof tool.annotations.readOnlyHint === 'boolean'));
    });

    const contexto = await call(client, 'ver_contexto');
    const empresaId = contexto.empresas[0].id;

    await t.test('solo ve sus propios datos', async () => {
        assert.equal(contexto.empresas.length, 1);
        const search = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', categoria: 'Secreto' });
        assert.equal(search.gastos.numero, 0);
        if (foreignBusiness) {
            const foreign = await call(client, 'resumen_empresa', { empresa_id: foreignBusiness });
            assert.match(foreign.error, /No existe la empresa/);
        }
    });

    await t.test('crea, edita, busca y deshace gastos personales', async () => {
        const created = await call(client, 'guardar_movimiento_personal', { tipo: 'gasto', date: '2026-11-05', amount: 45.5, category: 'Supermercado', payment_method: 'Tarjeta', notes: 'Mercadona' });
        assert.equal(created.accion, 'creado');
        assert.equal(created.registro.amount, '45.5');
        const config = await call(client, 'ver_configuracion_personal');
        assert.ok(config.categorias_gasto.some(c => c.nombre === 'Supermercado'));

        const edited = await call(client, 'guardar_movimiento_personal', { tipo: 'gasto', id: created.registro.id, amount: '50.10' });
        assert.equal(edited.registro.amount, '50.1');
        assert.equal(edited.registro.notes, 'Mercadona');

        const found = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', texto: 'mercadona' });
        assert.equal(found.gastos.numero, 1);

        const undo = await call(client, 'deshacer_cambio', { ids: [edited.cambio] });
        assert.equal(undo.reverted.length, 1);
        const after = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', texto: 'mercadona' });
        assert.equal(after.gastos.registros[0].amount, '45.5');

        const invalid = await call(client, 'guardar_movimiento_personal', { tipo: 'gasto', date: '2026-11-05', amount: 12.345, category: 'Supermercado' });
        assert.ok(invalid.error);
    });

    await t.test('borrar y recuperar', async () => {
        const created = await call(client, 'guardar_movimiento_personal', { tipo: 'ingreso', date: '2026-11-01', amount: 2000, category: 'Nómina', source: 'Empresa' });
        const deleted = await call(client, 'borrar_movimientos_personales', { tipo: 'ingreso', ids: [created.registro.id, 999999] });
        assert.equal(deleted.borrados, 1);
        assert.deepEqual(deleted.no_encontrados, [999999]);
        const history = await call(client, 'historial_cambios', { entidad: 'income', limite: 1 });
        await call(client, 'deshacer_cambio', { ids: [history[0].id] });
        const back = await call(client, 'buscar_movimientos_personales', { tipo: 'ingreso' });
        assert.equal(back.ingresos.registros[0].id, created.registro.id);
    });

    await t.test('no deshace sin forzar si el registro cambió después', async () => {
        const created = await call(client, 'guardar_movimiento_personal', { tipo: 'gasto', date: '2026-11-06', amount: 10, category: 'Ocio' });
        await call(client, 'guardar_movimiento_personal', { tipo: 'gasto', id: created.registro.id, amount: 11 });
        const refused = await call(client, 'deshacer_cambio', { ids: [created.cambio] });
        assert.match(refused.error, /ha cambiado/);
        const forced = await call(client, 'deshacer_cambio', { ids: [created.cambio], forzar: true });
        assert.equal(forced.reverted.length, 1);
    });

    await t.test('presupuestos, resumen con desviación y renombrado reversible', async () => {
        const budgets = await call(client, 'fijar_presupuestos', { presupuestos: [{ categoria: 'Supermercado', importe_mensual: 40 }] });
        assert.equal(budgets.resultados[0].resultado, 'creado');
        const summary = await call(client, 'resumen_personal', { mes: '2026-11' });
        assert.equal(summary.ingresos, 2000);
        const cat = summary.por_categoria.find(c => c.categoria === 'Supermercado');
        assert.equal(cat.desviacion, 5.5);
        assert.ok(summary.categorias_desviadas.includes('Supermercado'));
        assert.equal(summary.tasa_ahorro_pct, 97.7);

        const renamed = await call(client, 'gestionar_categoria', { accion: 'renombrar', tipo: 'gasto', nombre: 'Supermercado', nuevo_nombre: 'Alimentación' });
        const moved = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', categoria: 'Alimentación' });
        assert.equal(moved.gastos.numero, 1);
        await call(client, 'deshacer_cambio', { ids: [renamed.cambio] });
        const config = await call(client, 'ver_configuracion_personal');
        assert.ok(config.presupuestos_mensuales.some(b => b.categoria === 'Supermercado'));
    });

    await t.test('patrimonio con efectivo e inversiones', async () => {
        await call(client, 'guardar_saldo_efectivo', { date: '2026-11-01', account: 'Banco', current_value: 5000 });
        const fixed = await call(client, 'guardar_saldo_efectivo', { date: '2026-11-01', account: 'Banco', current_value: 5200 });
        assert.equal(fixed.accion, 'corregido');
        await call(client, 'guardar_valor_inversion', { date: '2026-10-01', account: 'Fondo indexado', asset_type: 'Fondos', contribution: 1000, current_value: 1000 });
        await call(client, 'guardar_valor_inversion', { date: '2026-11-01', account: 'Fondo indexado', contribution: 500, current_value: 1650 });
        const worth = await call(client, 'ver_patrimonio', { fecha: '2026-11-22', evolucion_meses: 2 });
        assert.equal(worth.patrimonio_total, 6850);
        assert.equal(worth.liquido, 5200);
        assert.equal(worth.aportado, 1500);
        assert.equal(worth.plusvalia, 150);
        assert.equal(worth.rentabilidad_pct, 10);
        assert.equal(worth.evolucion.length, 2);
        assert.equal(worth.evolucion[0].patrimonio, 1000);
    });

    await t.test('empresa: cuenta, factura, cobro vinculado, traspaso y deshacer por lote', async () => {
        const bank = await call(client, 'gestionar_cuenta_empresa', { empresa_id: empresaId, accion: 'crear', name: 'Banco empresa', opening_balance: 1000, opening_on: '2026-01-01' });
        const cash = await call(client, 'gestionar_cuenta_empresa', { empresa_id: empresaId, accion: 'crear', name: 'Caja', kind: 'CASH', opening_balance: 0, opening_on: '2026-01-01' });
        const invoice = await call(client, 'guardar_operacion_empresa', {
            empresa_id: empresaId, direction: 'INCOME', description: 'Consultoría', category: 'Servicios', occurred_on: '2026-11-03', due_on: '2026-11-30',
            counterparty_name: 'Cliente SL', document_kind: 'INVOICE', document_number: 'F-001', document_date: '2026-11-03',
            tax_lines: [{ base: 1000, vat_rate: 21 }], withholding_rate: 15,
        });
        assert.equal(invoice.operacion.total_amount, '1060');
        const pending = await call(client, 'buscar_operaciones_empresa', { empresa_id: empresaId, solo_pendientes: true });
        assert.equal(pending[0].pendiente, '1060.00');

        const charge = await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: '2026-11-10', amount: 1060, description: 'Cobro F-001', direction: 'IN', account_id: bank.cuenta.id, allocations: [{ activity_id: invoice.operacion.id, amount: 1060 }] });
        assert.equal(charge.movimientos.length, 1);
        const summary = await call(client, 'resumen_empresa', { empresa_id: empresaId, mes: '2026-11' });
        assert.equal(summary.pending.income, '0.00');
        assert.equal(summary.liquid, '2060.00');
        assert.equal(summary.vat.output, '210.00');

        const editedInvoice = await call(client, 'guardar_operacion_empresa', { empresa_id: empresaId, id: invoice.operacion.id, description: 'Consultoría noviembre' });
        assert.equal(editedInvoice.operacion.total_amount, '1060');
        assert.equal(editedInvoice.operacion.withholding_amount, '150');

        const transfer = await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: '2026-11-11', amount: 200, description: 'A caja', flow_type: 'TRANSFER', from_account_id: bank.cuenta.id, to_account_id: cash.cuenta.id });
        assert.equal(transfer.movimientos.length, 2);
        const removed = await call(client, 'borrar_movimiento_empresa', { empresa_id: empresaId, id: transfer.movimientos[0].id });
        assert.equal(removed.borrados.length, 2);
        await call(client, 'deshacer_cambio', { lote: removed.lote });
        const config = await call(client, 'ver_configuracion_empresa', { empresa_id: empresaId });
        assert.equal(config.cuentas.find(a => a.name === 'Caja').saldo, '200.00');

        const removedCharge = await call(client, 'borrar_movimiento_empresa', { empresa_id: empresaId, id: charge.movimientos[0].id });
        const reopened = await call(client, 'buscar_operaciones_empresa', { empresa_id: empresaId, solo_pendientes: true });
        assert.equal(reopened.length, 1);
        const history = await call(client, 'historial_cambios', { entidad: 'business_movement', limite: 1 });
        assert.equal(history[0].entity_id, removedCharge.borrados[0]);
        await call(client, 'deshacer_cambio', { ids: [history[0].id] });
        const settled = await call(client, 'buscar_operaciones_empresa', { empresa_id: empresaId, solo_pendientes: true });
        assert.equal(settled.length, 0);

        const blocked = await call(client, 'borrar_operacion_empresa', { empresa_id: empresaId, id: invoice.operacion.id });
        assert.match(blocked.error, /Desvincula/);
    });
});
