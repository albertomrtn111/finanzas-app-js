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

    await t.test('importación de una captura: duplicados, sugerencias, guardado en bloque y deshacer', async () => {
        const config = await call(client, 'ver_configuracion_empresa', { empresa_id: empresaId });
        const bankId = config.cuentas.find(a => a.name === 'Banco empresa').id;
        const invoice = await call(client, 'guardar_operacion_empresa', {
            empresa_id: empresaId, direction: 'INCOME', description: 'Mantenimiento web', category: 'Servicios', occurred_on: '2026-11-14',
            counterparty_name: 'Cliente SL', tax_lines: [{ base: 500, vat_rate: 0 }],
        });
        const filas = [
            { fecha: '2026-11-05', importe: -45.5, concepto: 'COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA', cuenta: 'BBVA' },
            { fecha: '2026-11-12', importe: '-12,30', concepto: 'NETFLIX.COM', cuenta: 'BBVA' },
            { fecha: '2026-11-12', importe: '-12,30', concepto: 'NETFLIX.COM', cuenta: 'BBVA' },
            { fecha: '2026-11-15', importe: 500, concepto: 'TRANSF RECIBIDA CLIENTE SL', cuenta: 'Santander empresa' },
        ];
        const prep = await call(client, 'preparar_importacion', { filas });
        assert.deepEqual(prep.resumen.con_duplicado_seguro, [1]);
        assert.deepEqual(prep.resumen.repetidas_en_lote, [3]);
        assert.equal(prep.filas[0].duplicados[0].tipo, 'gasto');
        assert.equal(prep.filas[0].sugerencia.category, 'Supermercado');
        assert.equal(prep.filas[1].sugerencia, null);
        assert.equal(prep.filas[3].facturas_candidatas[0].activity_id, invoice.operacion.id);
        assert.equal(prep.filas[3].facturas_candidatas[0].importe_exacto, true);
        assert.ok(prep.opciones.empresas[0].cuentas.some(a => a.id === bankId));

        const clasificadas = [
            { ...filas[0], destino: 'gasto', category: 'Supermercado' },
            { ...filas[1], destino: 'gasto', category: 'Suscripciones', payment_method: 'Tarjeta' },
            { ...filas[2], destino: 'gasto', category: 'Suscripciones', payment_method: 'Tarjeta' },
            { ...filas[3], destino: 'movimiento_empresa', empresa_id: empresaId, account_id: bankId, allocations: [{ activity_id: invoice.operacion.id, amount: 500 }] },
        ];
        const invalid = await call(client, 'importar_movimientos', { nombre: 'Inválida', filas: [clasificadas[1], { ...clasificadas[3], account_id: undefined }] });
        assert.match(invalid.error, /Fila 2: falta account_id/);
        const unchanged = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', texto: 'netflix' });
        assert.equal(unchanged.gastos.numero, 0);

        const imported = await call(client, 'importar_movimientos', { nombre: 'BBVA y Santander noviembre', filas: clasificadas });
        assert.equal(imported.importadas, 2);
        assert.deepEqual(imported.omitidas.map(o => o.fila), [1, 3]);
        assert.match(imported.lote, /^importacion-/);
        assert.deepEqual(imported.aprendido, { reglas_creadas: 2, reglas_actualizadas: 0 });
        const netflix = await call(client, 'buscar_movimientos_personales', { tipo: 'gasto', texto: 'netflix' });
        assert.equal(netflix.gastos.registros[0].amount, '12.3');
        assert.equal(netflix.gastos.registros[0].notes, 'NETFLIX.COM');
        const settled = await call(client, 'buscar_operaciones_empresa', { empresa_id: empresaId, solo_pendientes: true });
        assert.equal(settled.length, 0);

        const again = await call(client, 'importar_movimientos', { nombre: 'Repetida', filas: [clasificadas[1]] });
        assert.equal(again.importadas, 0);
        assert.equal(again.omitidas[0].motivo, 'ya registrada');

        const learned = await call(client, 'preparar_importacion', { filas: [{ fecha: '2026-11-20', importe: -12.3, concepto: 'Netflix.com Amsterdam', cuenta: 'bbva' }] });
        assert.equal(learned.filas[0].sugerencia.category, 'Suscripciones');
        assert.equal(learned.filas[0].sugerencia.payment_method, 'Tarjeta');
        assert.equal(learned.filas[0].cuenta_habitual.espacio, 'personal');

        const list = await call(client, 'ver_importaciones', {});
        assert.equal(list[0].estado, 'vigente');
        assert.equal(list[0].importadas, 2);

        const undo = await call(client, 'deshacer_cambio', { lote: imported.lote });
        // Gasto, categoría nueva y cobro de empresa, más las dos reglas aprendidas (Netflix y Cliente SL).
        assert.equal(undo.reverted.length, 5);
        const after = await call(client, 'ver_importaciones', { lote: imported.lote });
        assert.equal(after[0].estado, 'deshecha');
        const reopened = await call(client, 'buscar_operaciones_empresa', { empresa_id: empresaId, solo_pendientes: true });
        assert.equal(reopened.length, 1);
        const personal = await call(client, 'ver_configuracion_personal');
        assert.ok(!personal.categorias_gasto.some(c => c.nombre === 'Suscripciones'));
        const forgotten = await call(client, 'preparar_importacion', { filas: [{ fecha: '2026-11-20', importe: -12.3, concepto: 'Netflix.com', cuenta: 'bbva' }] });
        assert.equal(forgotten.filas[0].sugerencia, null);
    });

    await t.test('deshacer no deja una factura cobrada dos veces', async () => {
        const config = await call(client, 'ver_configuracion_empresa', { empresa_id: empresaId });
        const bankId = config.cuentas.find(a => a.name === 'Banco empresa').id;
        const inv = await call(client, 'guardar_operacion_empresa', { empresa_id: empresaId, direction: 'INCOME', description: 'Doble', category: 'Servicios', occurred_on: '2026-11-16', tax_lines: [{ base: 80, vat_rate: 0 }] });
        const first = await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: '2026-11-17', amount: 80, description: 'Cobro 1', direction: 'IN', account_id: bankId, allocations: [{ activity_id: inv.operacion.id, amount: 80 }] });
        assert.equal(first.cambios.length, 1);
        const unlink = await call(client, 'vincular_movimiento_empresa', { empresa_id: empresaId, movimiento_id: first.movimientos[0].id, allocations: [] });
        await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: '2026-11-18', amount: 80, description: 'Cobro 2', direction: 'IN', account_id: bankId, allocations: [{ activity_id: inv.operacion.id, amount: 80 }] });
        const refused = await call(client, 'deshacer_cambio', { ids: [unlink.cambio] });
        assert.match(refused.error, /supera el pendiente/);
        const again = await call(client, 'deshacer_cambio', { ids: [unlink.cambio] });
        assert.match(again.error, /supera el pendiente/);
        const invalid = await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: '2026-11-18', amount: 5, description: 'x', direction: 'IN', account_id: bankId, allocations: [{ activity_id: inv.operacion.id, amount: 5 }] });
        assert.match(invalid.error, /supera el pendiente/);
        const moves = await call(client, 'buscar_movimientos_empresa', { empresa_id: empresaId, texto: 'x' });
        assert.equal(moves.filter(m => m.description === 'x').length, 0);
    });

    await t.test('empresa: trimestres de IVA cerrados y cuentas con movimientos', async () => {
        const today = contexto.hoy;
        const month = Number(today.slice(5, 7));
        const start = month - ((month - 1) % 3);
        const closedDay = start === 1 ? `${Number(today.slice(0, 4)) - 1}-10-15` : `${today.slice(0, 4)}-${String(start - 3).padStart(2, '0')}-15`;
        const closedQuarter = `${closedDay.slice(0, 4)}-Q${Math.floor((Number(closedDay.slice(5, 7)) - 1) / 3) + 1}`;
        const old = await call(client, 'guardar_operacion_empresa', {
            empresa_id: empresaId, direction: 'INCOME', description: 'Factura de un trimestre cerrado', category: 'Servicios', occurred_on: closedDay,
            counterparty_name: 'Cliente SL', document_kind: 'INVOICE', document_number: 'F-CERRADO', document_date: closedDay, tax_lines: [{ base: 100, vat_rate: 21 }],
        });
        assert.equal(old.operacion.vat_period, closedQuarter);
        const id = old.operacion.id;
        const refused = await call(client, 'guardar_operacion_empresa', { empresa_id: empresaId, id, tax_lines: [{ base: 120, vat_rate: 21 }] });
        assert.match(refused.error, /puede estar declarado.*confirmar_trimestre_cerrado: true/s);
        const renamed = await call(client, 'guardar_operacion_empresa', { empresa_id: empresaId, id, description: 'Factura antigua' });
        assert.equal(renamed.accion, 'editada');
        const confirmed = await call(client, 'guardar_operacion_empresa', { empresa_id: empresaId, id, tax_lines: [{ base: 120, vat_rate: 21 }], confirmar_trimestre_cerrado: true });
        assert.equal(confirmed.operacion.total_amount, '145.2');
        assert.match((await call(client, 'borrar_operacion_empresa', { empresa_id: empresaId, id })).error, /confirmar_trimestre_cerrado/);
        assert.equal((await call(client, 'borrar_operacion_empresa', { empresa_id: empresaId, id, confirmar_trimestre_cerrado: true })).borrada, id);
        const early = await call(client, 'guardar_operacion_empresa', {
            empresa_id: empresaId, direction: 'INCOME', description: 'Periodo anterior', category: 'Servicios', occurred_on: today,
            counterparty_name: 'Cliente SL', document_kind: 'INVOICE', document_number: 'F-PERIODO', document_date: today, vat_period: closedQuarter, tax_lines: [{ base: 10, vat_rate: 21 }],
        });
        assert.match(early.error, /anterior al trimestre de la fecha de factura/);

        const temp = await call(client, 'gestionar_cuenta_empresa', { empresa_id: empresaId, accion: 'crear', name: 'Temporal', opening_balance: 0, opening_on: '2026-01-01' });
        const move = await call(client, 'registrar_movimiento_empresa', { empresa_id: empresaId, date: today, amount: 5, description: 'Prueba de cuenta', direction: 'IN', account_id: temp.cuenta.id });
        assert.match((await call(client, 'gestionar_cuenta_empresa', { empresa_id: empresaId, accion: 'borrar', id: temp.cuenta.id })).error, /tiene movimientos/);
        assert.match((await call(client, 'deshacer_cambio', { ids: [temp.cambio] })).error, /tiene un movimiento/);
        await call(client, 'borrar_movimiento_empresa', { empresa_id: empresaId, id: move.movimientos[0].id });
        assert.equal((await call(client, 'gestionar_cuenta_empresa', { empresa_id: empresaId, accion: 'borrar', id: temp.cuenta.id })).accion, 'borrada');
    });

    await t.test('ofrece la guía de importación como prompt', async () => {
        const { prompts } = await client.listPrompts();
        assert.ok(prompts.some(p => p.name === 'importar_extracto'));
        const prompt = await client.getPrompt({ name: 'importar_extracto' });
        assert.match(prompt.messages[0].content.text, /preparar_importacion/);
    });
});
