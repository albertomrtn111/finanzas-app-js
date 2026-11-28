// Aislamiento entre usuarios en el MCP: con el token de B se intenta leer y escribir datos de A.
// Necesita la app en marcha contra una base de datos de pruebas y dos usuarios con empresa:
//   MCP_TEST_URL, MCP_TEST_TOKEN (usuario A) y MCP_TEST_TOKEN_OTRO (usuario B).
// Nunca la ejecutes contra la base de datos real: crea registros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.MCP_TEST_URL;
const tokenA = process.env.MCP_TEST_TOKEN;
const tokenB = process.env.MCP_TEST_TOKEN_OTRO;
const skip = !url || !tokenA || !tokenB;

async function connect(token) {
    const client = new Client({ name: 'aislamiento', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
}

async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? '';
    if (result.isError) return { error: text };
    return JSON.parse(text);
}

test('MCP: cada usuario solo ve y escribe sus datos', { skip }, async t => {
    const a = await connect(tokenA);
    const b = await connect(tokenB);
    t.after(async () => { await a.close(); await b.close(); });

    // Datos de A.
    const ctxA = await call(a, 'ver_contexto');
    const ctxB = await call(b, 'ver_contexto');
    const empresaA = ctxA.empresas[0].id;
    const empresaB = ctxB.empresas[0].id;
    assert.notEqual(empresaA, empresaB);
    const gastoA = await call(a, 'guardar_movimiento_personal', { tipo: 'gasto', date: '2026-11-02', amount: 77.7, category: 'PrivadoA', notes: 'SOLO-A' });
    const ingresoA = await call(a, 'guardar_movimiento_personal', { tipo: 'ingreso', date: '2026-11-02', amount: 1234, category: 'NominaA' });
    const saldoA = await call(a, 'guardar_saldo_efectivo', { date: '2026-11-02', account: 'BancoA', current_value: 9999 });
    const cuentaA = await call(a, 'gestionar_cuenta_empresa', { empresa_id: empresaA, accion: 'crear', name: 'Banco A', opening_balance: 100, opening_on: '2026-01-01' });
    const facturaA = await call(a, 'guardar_operacion_empresa', { empresa_id: empresaA, direction: 'INCOME', description: 'Factura A', category: 'Servicios', occurred_on: '2026-11-02', tax_lines: [{ base: 50, vat_rate: 0 }] });
    const movA = await call(a, 'registrar_movimiento_empresa', { empresa_id: empresaA, date: '2026-11-02', amount: 10, description: 'Cobro A', direction: 'IN', account_id: cuentaA.cuenta.id });
    const importA = await call(a, 'importar_movimientos', { nombre: 'Import A', filas: [{ destino: 'gasto', fecha: '2026-11-03', importe: -5, concepto: 'TIENDA A', category: 'PrivadoA' }] });
    const cuentaB = await call(b, 'gestionar_cuenta_empresa', { empresa_id: empresaB, accion: 'crear', name: 'Banco B', opening_balance: 0, opening_on: '2026-01-01' });

    await t.test('lecturas: B no ve nada de A', async () => {
        const search = await call(b, 'buscar_movimientos_personales', { texto: 'SOLO-A' });
        assert.equal(search.gastos.numero, 0);
        const cats = await call(b, 'buscar_movimientos_personales', { tipo: 'gasto', categoria: 'PrivadoA' });
        assert.equal(cats.gastos.numero, 0);
        const config = await call(b, 'ver_configuracion_personal');
        assert.ok(!config.categorias_gasto.some(c => c.nombre === 'PrivadoA'));
        assert.ok(!config.cuentas_efectivo.some(c => c.cuenta === 'BancoA'));
        const worth = await call(b, 'ver_patrimonio', { fecha: '2026-11-30' });
        assert.ok(!(worth.cuentas_efectivo || []).some?.(c => c.cuenta === 'BancoA'));
        assert.equal(JSON.stringify(worth).includes('BancoA'), false);
        const hist = await call(b, 'historial_patrimonio', { tipo: 'efectivo' });
        assert.ok(!hist.some(r => r.id === saldoA.registro.id));
        const summary = await call(b, 'resumen_personal', { mes: '2026-11' });
        assert.equal(JSON.stringify(summary).includes('PrivadoA'), false);
        const changes = await call(b, 'historial_cambios', { limite: 200, solo_activos: false });
        assert.ok(changes.every(ch => ch.user_id !== undefined ? ch.user_id === changes[0].user_id : true));
        assert.equal(JSON.stringify(changes).includes('SOLO-A'), false);
        assert.deepEqual(await call(b, 'ver_importaciones', { lote: importA.lote }), []);
        for (const tool of ['resumen_empresa', 'buscar_operaciones_empresa', 'buscar_movimientos_empresa', 'ver_configuracion_empresa']) {
            const res = await call(b, tool, { empresa_id: empresaA });
            assert.match(res.error || '', /No existe la empresa/, tool);
        }
        const prep = await call(b, 'preparar_importacion', { filas: [{ fecha: '2026-11-02', importe: -77.7, concepto: 'SOLO-A' }, { fecha: '2026-11-02', importe: 50, concepto: 'Factura A' }] });
        assert.equal(prep.filas[0].duplicados.length, 0);
        assert.equal(prep.filas[0].sugerencia, null);
        assert.equal(prep.filas[1].facturas_candidatas.length, 0);
        assert.equal(prep.opciones.empresas.some(e => e.id === empresaA), false);
        const prepForeign = await call(b, 'preparar_importacion', { filas: [{ fecha: '2026-11-02', importe: -1, concepto: 'x' }], empresa_ids: [empresaA] });
        assert.ok(prepForeign.error);
    });

    await t.test('escrituras personales: B no puede tocar registros de A', async () => {
        const edit = await call(b, 'guardar_movimiento_personal', { tipo: 'gasto', id: gastoA.registro.id, amount: 1 });
        assert.match(edit.error, /No existe/);
        const editIncome = await call(b, 'guardar_movimiento_personal', { tipo: 'ingreso', id: ingresoA.registro.id, amount: 1 });
        assert.match(editIncome.error, /No existe/);
        const del = await call(b, 'borrar_movimientos_personales', { tipo: 'gasto', ids: [gastoA.registro.id] });
        assert.equal(del.borrados, 0);
        const cash = await call(b, 'guardar_saldo_efectivo', { id: saldoA.registro.id, current_value: 1 });
        assert.ok(cash.error);
        const delCash = await call(b, 'borrar_registro_patrimonio', { tipo: 'efectivo', id: saldoA.registro.id });
        assert.ok(delCash.error || delCash.borrados === 0);
        const rename = await call(b, 'gestionar_categoria', { accion: 'renombrar', tipo: 'gasto', nombre: 'PrivadoA', nuevo_nombre: 'Robado' });
        assert.ok(rename.error);
        const removeCat = await call(b, 'gestionar_categoria', { accion: 'borrar', tipo: 'gasto', nombre: 'PrivadoA' });
        assert.ok(removeCat.error);
    });

    await t.test('escrituras de empresa: B no puede usar la empresa, cuentas ni facturas de A', async () => {
        const inForeign = await call(b, 'registrar_movimiento_empresa', { empresa_id: empresaA, date: '2026-11-02', amount: 1, description: 'x', direction: 'IN', account_id: cuentaA.cuenta.id });
        assert.match(inForeign.error, /No existe la empresa/);
        const foreignAccount = await call(b, 'registrar_movimiento_empresa', { empresa_id: empresaB, date: '2026-11-02', amount: 1, description: 'x', direction: 'IN', account_id: cuentaA.cuenta.id });
        assert.ok(foreignAccount.error);
        const foreignTransfer = await call(b, 'registrar_movimiento_empresa', { empresa_id: empresaB, date: '2026-11-02', amount: 1, description: 'x', flow_type: 'TRANSFER', from_account_id: cuentaB.cuenta.id, to_account_id: cuentaA.cuenta.id });
        assert.ok(foreignTransfer.error);
        const foreignInvoice = await call(b, 'registrar_movimiento_empresa', { empresa_id: empresaB, date: '2026-11-02', amount: 10, description: 'x', direction: 'IN', account_id: cuentaB.cuenta.id, allocations: [{ activity_id: facturaA.operacion.id, amount: 10 }] });
        assert.ok(foreignInvoice.error);
        const editInvoice = await call(b, 'guardar_operacion_empresa', { empresa_id: empresaB, id: facturaA.operacion.id, description: 'Robada' });
        assert.ok(editInvoice.error);
        const delInvoice = await call(b, 'borrar_operacion_empresa', { empresa_id: empresaB, id: facturaA.operacion.id });
        assert.ok(delInvoice.error);
        const delMove = await call(b, 'borrar_movimiento_empresa', { empresa_id: empresaB, id: movA.movimientos[0].id });
        assert.ok(delMove.error);
        const link = await call(b, 'vincular_movimiento_empresa', { empresa_id: empresaB, movimiento_id: movA.movimientos[0].id, allocations: [] });
        assert.ok(link.error);
        const importForeign = await call(b, 'importar_movimientos', { nombre: 'x', filas: [{ destino: 'movimiento_empresa', fecha: '2026-11-03', importe: 5, concepto: 'x', empresa_id: empresaA, account_id: cuentaA.cuenta.id }] });
        assert.match(importForeign.error, /No existe la empresa/);
        const importForeignAccount = await call(b, 'importar_movimientos', { nombre: 'x', filas: [{ destino: 'movimiento_empresa', fecha: '2026-11-03', importe: 5, concepto: 'x', empresa_id: empresaB, account_id: cuentaA.cuenta.id }] });
        assert.ok(importForeignAccount.error);
    });

    await t.test('deshacer: B no puede revertir cambios ni lotes de A', async () => {
        const byId = await call(b, 'deshacer_cambio', { ids: [gastoA.cambio, ingresoA.cambio, saldoA.cambio, facturaA.cambio] });
        assert.equal(byId.reverted.length, 0);
        const byBatch = await call(b, 'deshacer_cambio', { lote: importA.lote });
        assert.equal(byBatch.reverted.length, 0);
    });

    await t.test('los datos de A siguen intactos', async () => {
        const own = await call(a, 'buscar_movimientos_personales', { texto: 'SOLO-A' });
        assert.equal(own.gastos.numero, 1);
        assert.equal(own.gastos.registros[0].amount, '77.7');
        const invoices = await call(a, 'buscar_operaciones_empresa', { empresa_id: empresaA });
        assert.equal(invoices.find(i => i.id === facturaA.operacion.id).description, 'Factura A');
        const moves = await call(a, 'buscar_movimientos_empresa', { empresa_id: empresaA });
        assert.ok(moves.some(m => m.id === movA.movimientos[0].id));
        const imports = await call(a, 'ver_importaciones', { lote: importA.lote });
        assert.equal(imports[0].estado, 'vigente');
        const config = await call(a, 'ver_configuracion_empresa', { empresa_id: empresaA });
        assert.equal(config.cuentas.find(c => c.name === 'Banco A').saldo, '110.00');
    });
});
