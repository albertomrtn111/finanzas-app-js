import test from 'node:test';
import assert from 'node:assert/strict';
import { batchRepeats, buildHistory, duplicateLevel, merchantKey, normalizeConcept, similarity, suggest } from '../src/lib/mcp/importing.js';

test('normaliza conceptos de banco y saca la clave del comercio', () => {
    assert.equal(normalizeConcept('COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA 21/11'), 'compra tarj mercadona valencia');
    assert.equal(merchantKey('COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA 21/11'), 'mercadona valencia');
    assert.equal(merchantKey('Pago en AMAZON.ES*2K4 Luxemburgo'), 'amazon 2k4');
    assert.equal(merchantKey('Café Ñandú'), 'cafe nandu');
    assert.ok(similarity('MERCADONA VALENCIA', 'Compra Mercadona') >= 0.5);
    assert.equal(similarity('NETFLIX', 'SPOTIFY'), 0);
});

test('duplicados: seguro, posible o nada', () => {
    const row = { fecha: '2026-11-21', centimos: -4550, concepto: 'COMPRA MERCADONA VALENCIA' };
    assert.equal(duplicateLevel(row, { fecha: '2026-11-21', centimos: -4550, concepto: 'Mercadona' }), 'seguro');
    assert.equal(duplicateLevel(row, { fecha: '2026-11-22', centimos: -4550, concepto: 'Supermercado' }), null);
    assert.equal(duplicateLevel(row, { fecha: '2026-11-21', centimos: -4550, concepto: 'Supermercado' }), 'posible');
    assert.equal(duplicateLevel(row, { fecha: '2026-11-20', centimos: -4550, concepto: '' }), 'seguro');
    assert.equal(duplicateLevel(row, { fecha: '2026-11-23', centimos: -4550, concepto: 'mercadona' }), 'posible');
    assert.equal(duplicateLevel(row, { fecha: '2026-11-21', centimos: 4550, concepto: 'Mercadona' }), null);
    assert.equal(duplicateLevel(row, { fecha: '2026-11-30', centimos: -4550, concepto: 'Mercadona' }), null);
});

test('filas repetidas dentro del lote (capturas solapadas)', () => {
    const rows = [
        { fecha: '2026-11-01', centimos: -1000, concepto: 'BAR PEPE' },
        { fecha: '2026-11-02', centimos: -1000, concepto: 'BAR PEPE' },
        { fecha: '2026-11-01', centimos: -1000, concepto: 'Bar Pepe ' },
    ];
    assert.deepEqual(batchRepeats(rows), [null, null, 0]);
});

test('sugerencia según el historial, respetando el sentido', () => {
    const history = buildHistory([
        { concepto: 'COMPRA MERCADONA VALENCIA', clasificacion: { sentido: 'salida', destino: 'gasto', category: 'Supermercado' } },
        { concepto: 'Mercadona Valencia', clasificacion: { sentido: 'salida', destino: 'gasto', category: 'Supermercado' } },
        { concepto: 'MERCADONA VALENCIA', clasificacion: { sentido: 'salida', destino: 'gasto', category: 'Casa' } },
        { concepto: 'MERCADONA VALENCIA devolución', clasificacion: { sentido: 'entrada', destino: 'ingreso', category: 'Devoluciones' } },
        { concepto: 'Transferencia Cliente SL', clasificacion: { sentido: 'entrada', destino: 'movimiento_empresa', empresa_id: 1, account_id: 3 }, peso: 3 },
    ]);
    const food = suggest(history, 'PAGO MERCADONA VALENCIA 12/11', 'salida');
    assert.equal(food.category, 'Supermercado');
    assert.equal(food.confianza, 0.67);
    assert.equal(food.alternativas[0].category, 'Casa');
    assert.equal(suggest(history, 'MERCADONA VALENCIA', 'entrada').category, 'Devoluciones');
    assert.equal(suggest(history, 'MERCADONA ALICANTE', 'salida').category, 'Supermercado');
    const client = suggest(history, 'TRANSF. RECIBIDA CLIENTE SL F-001', 'entrada');
    assert.equal(client.destino, 'movimiento_empresa');
    assert.equal(client.empresa_id, 1);
    assert.equal(suggest(history, 'Gasolinera Repsol', 'salida'), null);
});
