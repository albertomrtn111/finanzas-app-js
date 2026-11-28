import test from 'node:test';
import assert from 'node:assert/strict';
import {
    bestRule, classificationChanged, learningItemFromRecord, matchLevel, parseConcept, parseRuleInput, planLearning,
    planRuleRevert, ruleConfidence, sameClassification, suggestionFromRule,
} from '../src/lib/classificationRules.js';

let nextId = 1;
function rule(fields) {
    return {
        id: nextId++, direction: 'OUT', merchant_key: '', pattern: '', destination: 'EXPENSE', business_id: null, account_id: null, flow_type: null,
        category: 'Supermercado', subcategory: null, payment_method: null, expense_type: null, source: null,
        origin: 'LEARNED', hits: 1, example: null, last_used_at: null, ...fields,
    };
}

const expense = (category, extra = {}) => ({ destination: 'EXPENSE', category, ...extra });

test('coincidencia: exacta, incluye, contiene y parecida', () => {
    const concept = parseConcept('COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA 21/11');
    assert.equal(concept.key, 'mercadona valencia');
    assert.equal(matchLevel(rule({ merchant_key: 'mercadona valencia' }), concept), 'exacta');
    assert.equal(matchLevel(rule({ merchant_key: 'mercadona' }), parseConcept('PAGO MOVIL MERCADONA')), 'incluye');
    assert.equal(matchLevel(rule({ merchant_key: 'mercadona valencia' }), parseConcept('MERCADONA ALICANTE')), 'parecida');
    assert.equal(matchLevel(rule({ merchant_key: 'bar pepe' }), parseConcept('BAR MANOLO')), null, 'la primera palabra es corta');
    assert.equal(matchLevel(rule({ pattern: 'bizum juan' }), parseConcept('BIZUM DE JUAN PEREZ')), null, '«de» está en medio');
    assert.equal(matchLevel(rule({ pattern: 'juan perez' }), parseConcept('BIZUM DE JUAN PEREZ')), 'contiene');
    assert.equal(matchLevel(rule({ pattern: 'bar' }), parseConcept('BARCELONA PARKING')), null, 'solo palabras enteras');
    assert.equal(matchLevel(rule({ merchant_key: 'amazon', pattern: 'prime' }), parseConcept('AMAZON MARKETPLACE')), null, 'falta el texto');
    assert.equal(matchLevel(rule({ merchant_key: 'amazon', pattern: 'prime' }), parseConcept('AMAZON PRIME ES')), 'incluye');
    assert.equal(matchLevel(rule({ merchant_key: 'amazon prime', pattern: 'prime' }), parseConcept('AMAZON PRIME ES')), 'exacta');
});

test('mejor regla: mismo sentido, manuales primero y las «parecidas» al final', () => {
    const learned = rule({ merchant_key: 'mercadona valencia', category: 'Alimentación', hits: 9 });
    const manual = rule({ merchant_key: 'mercadona', category: 'Supermercado', origin: 'MANUAL', hits: 0 });
    const refund = rule({ merchant_key: 'mercadona valencia', direction: 'IN', destination: 'INCOME', category: 'Devoluciones' });
    assert.equal(bestRule([learned, manual, refund], 'MERCADONA VALENCIA', 'OUT').rule, manual, 'la manual manda aunque sea menos exacta');
    assert.equal(bestRule([learned, manual, refund], 'MERCADONA VALENCIA', 'IN').rule, refund);
    const weakManual = rule({ merchant_key: 'mercadona alicante', origin: 'MANUAL', category: 'Casa' });
    const best = bestRule([weakManual, learned], 'MERCADONA VALENCIA', 'OUT');
    assert.equal(best.rule, learned, 'una manual solo «parecida» no gana a una exacta');
    assert.equal(best.coincidencia, 'exacta');
    const often = rule({ merchant_key: 'netflix', hits: 5 });
    const rarely = rule({ merchant_key: 'netflix', pattern: '', direction: 'OUT', hits: 1 });
    assert.equal(bestRule([rarely, often], 'NETFLIX.COM', 'OUT').rule, often, 'a igualdad, la más usada');
    assert.equal(bestRule([learned], 'GASOLINERA REPSOL', 'OUT'), null);
});

test('confianza según las veces confirmada, el origen y la coincidencia', () => {
    assert.equal(ruleConfidence(rule({ hits: 1 })), 0.6);
    assert.equal(ruleConfidence(rule({ hits: 2 })), 0.8);
    assert.equal(ruleConfidence(rule({ hits: 4 })), 0.9);
    assert.equal(ruleConfidence(rule({ hits: 10 })), 0.96);
    assert.equal(ruleConfidence(rule({ hits: 0, origin: 'MANUAL' })), 1);
    assert.equal(ruleConfidence(rule({ hits: 0, origin: 'MANUAL' }), 'incluye'), 0.95);
    assert.equal(ruleConfidence(rule({ hits: 2 }), 'parecida'), 0.64);
});

test('aprender: crea, refuerza y corrige la regla del comercio', () => {
    const now = new Date('2026-11-28T10:00:00Z');
    const items = [
        { concept: 'COMPRA MERCADONA VALENCIA', direction: 'OUT', classification: expense('Supermercado', { payment_method: 'Tarjeta' }) },
        { concept: 'MERCADONA VALENCIA 12/11', direction: 'OUT', classification: expense('Supermercado', { payment_method: 'Tarjeta' }) },
        { concept: 'NETFLIX.COM', direction: 'OUT', classification: expense('Suscripciones') },
    ];
    const first = planLearning([], items, now);
    assert.equal(first.writes.length, 2, 'una escritura por regla aunque haya dos filas del mismo comercio');
    const mercadona = first.writes.find(write => write.data.merchant_key === 'mercadona valencia');
    assert.equal(mercadona.type, 'create');
    assert.equal(mercadona.data.hits, 2);
    assert.equal(mercadona.data.origin, 'LEARNED');
    assert.equal(mercadona.data.payment_method, 'Tarjeta');
    assert.equal(mercadona.data.example, 'MERCADONA VALENCIA 12/11');
    assert.deepEqual(first.results.map(result => result.accion), ['creada', 'reforzada', 'creada']);

    const saved = rule({ merchant_key: 'mercadona valencia', category: 'Supermercado', payment_method: 'Tarjeta', hits: 2 });
    const again = planLearning([saved], [{ concept: 'MERCADONA VALENCIA', direction: 'OUT', classification: expense('Supermercado', { payment_method: 'Tarjeta' }) }], now);
    assert.deepEqual(again.writes.map(write => [write.type, write.id, write.data.hits]), [['update', saved.id, 3]]);

    const corrected = planLearning([saved], [{ concept: 'MERCADONA VALENCIA', direction: 'OUT', classification: expense('Alimentación') }], now);
    assert.equal(corrected.results[0].accion, 'cambiada');
    assert.equal(corrected.writes[0].data.category, 'Alimentación');
    assert.equal(corrected.writes[0].data.payment_method, null);
    assert.equal(corrected.writes[0].data.hits, 1, 'otra clasificación empieza de cero');
    assert.equal(corrected.writes[0].before.category, 'Supermercado');
    assert.equal(saved.category, 'Supermercado', 'no cambia las reglas que recibe');
});

test('aprender: las reglas manuales mandan y no se tocan', () => {
    const manual = rule({ merchant_key: 'mercadona', category: 'Supermercado', origin: 'MANUAL', hits: 0 });
    const other = planLearning([manual], [{ concept: 'MERCADONA VALENCIA', direction: 'OUT', classification: expense('Regalos') }]);
    assert.equal(other.writes.length, 0);
    assert.equal(other.results[0].accion, 'manda_manual');
    const same = planLearning([manual], [{ concept: 'MERCADONA VALENCIA', direction: 'OUT', classification: expense('Supermercado') }]);
    assert.deepEqual(same.writes.map(write => [write.type, write.data.category, write.data.origin, write.data.hits]), [['update', 'Supermercado', 'MANUAL', 1]]);
    const weak = rule({ merchant_key: 'mercadona alicante', origin: 'MANUAL', category: 'Casa' });
    const learned = planLearning([weak], [{ concept: 'MERCADONA VALENCIA', direction: 'OUT', classification: expense('Supermercado') }]);
    assert.equal(learned.writes[0].type, 'create', 'una manual solo «parecida» no impide aprender este comercio');
    const noise = planLearning([], [{ concept: 'TRANSFERENCIA', direction: 'OUT', classification: expense('Otros') }]);
    assert.deepEqual([noise.writes.length, noise.results[0].accion], [0, 'sin_comercio']);
    const business = planLearning([], [{ concept: 'TRANSF RECIBIDA CLIENTE SL', direction: 'IN', classification: { destination: 'BUSINESS', business_id: 3, account_id: 7, category: 'x' } }]);
    assert.deepEqual(
        [business.writes[0].data.merchant_key, business.writes[0].data.business_id, business.writes[0].data.account_id, business.writes[0].data.flow_type, business.writes[0].data.category],
        ['cliente', 3, 7, 'OPERATING', null],
    );
});

test('deshacer lo aprendido nunca bloquea; lo manual pide forzar si cambió', () => {
    const created = rule({ id: 50, merchant_key: 'netflix', category: 'Suscripciones', hits: 1, last_used_at: '2026-11-01T00:00:00.000Z' });
    const learnCreate = { action: 'LEARN', entity_id: 50, before: null, after: { ...created } };
    assert.equal(planRuleRevert(learnCreate, { ...created }).op, 'delete');
    assert.deepEqual(planRuleRevert(learnCreate, { ...created, hits: 3 }), { op: 'update', data: { hits: 2 }, message: 'La regla 50 se mantiene porque se ha usado después' });
    assert.equal(planRuleRevert(learnCreate, { ...created, category: 'Ocio' }).op, 'none', 'cambió después: se queda');
    assert.equal(planRuleRevert(learnCreate, { ...created, category: 'Ocio' }, true).op, 'delete');
    assert.equal(planRuleRevert(learnCreate, null).op, 'none');

    const reinforced = { ...created, hits: 2, last_used_at: '2026-11-20T00:00:00.000Z', example: 'NETFLIX.COM 20/11' };
    const learnUpdate = { action: 'LEARN', entity_id: 50, before: { ...created }, after: reinforced };
    assert.deepEqual(planRuleRevert(learnUpdate, { ...reinforced, last_used_at: new Date(reinforced.last_used_at) }).data, { hits: 1, last_used_at: created.last_used_at, example: null });
    assert.equal(planRuleRevert({ ...learnUpdate, before: { ...created, hits: 0 }, after: { ...reinforced, hits: 1 } }, { ...reinforced, hits: 1 }).op, 'delete', 'sin usos, la aprendida sobra');

    const changed = { ...created, category: 'Ocio', hits: 1 };
    const learnChange = { action: 'LEARN', entity_id: 50, before: { ...created, hits: 4 }, after: changed };
    const restore = planRuleRevert(learnChange, { ...changed });
    assert.equal(restore.op, 'update');
    assert.deepEqual([restore.data.category, restore.data.hits], ['Suscripciones', 4]);

    const manualCreate = { action: 'CREATE', entity_id: 51, before: null, after: rule({ id: 51, origin: 'MANUAL', merchant_key: 'bar pepe' }) };
    assert.throws(() => planRuleRevert(manualCreate, { ...manualCreate.after, category: 'Ocio' }), /ha cambiado después; usa forzar/);
    assert.equal(planRuleRevert(manualCreate, { ...manualCreate.after, hits: 5 }).op, 'delete', 'los usos no cuentan como cambio');
    const manualEdit = { action: 'UPDATE', entity_id: 50, before: { ...created }, after: { ...created, origin: 'MANUAL', category: 'Ocio' } };
    const undoEdit = planRuleRevert(manualEdit, { ...manualEdit.after, hits: 7 });
    assert.deepEqual([undoEdit.data.origin, undoEdit.data.category, undoEdit.data.hits], ['LEARNED', 'Suscripciones', undefined], 'conserva los usos de ahora');
    assert.throws(() => planRuleRevert(manualEdit, null), /ya no existe/);
    const manualDelete = { action: 'DELETE', entity_id: 52, before: { ...rule({ id: 52, merchant_key: 'gimnasio' }), user_id: 9 }, after: null };
    const recreate = planRuleRevert(manualDelete, null);
    assert.deepEqual([recreate.op, recreate.data.id, recreate.data.user_id, recreate.data.merchant_key], ['create', 52, 9, 'gimnasio']);
    assert.equal(planRuleRevert(manualDelete, { id: 52 }).op, 'none');
});

test('reglas manuales: validación y datos normalizados', () => {
    assert.deepEqual(parseRuleInput({ merchant: 'COMPRA TARJ. MERCADONA VALENCIA 21/11', destination: 'EXPENSE', category: ' Supermercado ', payment_method: '' }).value, {
        direction: 'OUT', merchant_key: 'mercadona valencia', pattern: '', destination: 'EXPENSE', business_id: null, account_id: null, flow_type: null,
        category: 'Supermercado', subcategory: null, payment_method: null, expense_type: null, source: null,
    });
    assert.equal(parseRuleInput({ pattern: 'Bizum Juan', destination: 'INCOME', category: 'Familia' }).value.pattern, 'bizum juan');
    assert.equal(parseRuleInput({ pattern: 'Bizum Juan', destination: 'INCOME', category: 'Familia' }).value.direction, 'IN');
    assert.match(parseRuleInput({ merchant: 'Compra tarjeta', destination: 'EXPENSE', category: 'x' }).error, /todos los bancos/);
    assert.match(parseRuleInput({ destination: 'EXPENSE', category: 'x' }).error, /comercio o el texto/);
    assert.match(parseRuleInput({ merchant: 'Mercadona', destination: 'EXPENSE' }).error, /categoría/);
    assert.match(parseRuleInput({ merchant: 'Mercadona', destination: 'EXPENSE', direction: 'IN', category: 'x' }).error, /salida/);
    assert.match(parseRuleInput({ merchant: 'Cliente SL', destination: 'BUSINESS', business_id: 1, account_id: 2 }).error, /salida o una entrada/);
    assert.match(parseRuleInput({ merchant: 'Cliente SL', destination: 'BUSINESS', direction: 'IN', business_id: 1 }).error, /cuenta/);
    assert.match(parseRuleInput({ merchant: 'Cliente SL', destination: 'BUSINESS', direction: 'IN', business_id: 1, account_id: 2, flow_type: 'TRANSFER' }).error, /flujo/);
    assert.match(parseRuleInput({ merchant: 'x', destination: 'OTRO' }).error, /a dónde va/);
    const business = parseRuleInput({ merchant: 'Cliente SL', destination: 'BUSINESS', direction: 'IN', business_id: '1', account_id: 2, category: 'Ignorada' }).value;
    assert.deepEqual([business.business_id, business.account_id, business.flow_type, business.category], [1, 2, 'OPERATING', null]);

    const existing = rule({ merchant_key: 'netflix', category: 'Suscripciones', payment_method: 'Tarjeta' });
    const edited = parseRuleInput({ category: 'Ocio' }, existing).value;
    assert.deepEqual([edited.merchant_key, edited.category, edited.payment_method], ['netflix', 'Ocio', 'Tarjeta']);
    assert.equal(parseRuleInput({ destination: 'INCOME' }, existing).value.direction, 'IN', 'al cambiar de destino se deduce el sentido');
});

test('qué se aprende de un gasto o ingreso corregido', () => {
    assert.equal(classificationChanged('expense', { category: 'A', subcategory: null, payment_method: 'Tarjeta' }, { category: 'A', subcategory: '', payment_method: 'Tarjeta' }), false);
    assert.equal(classificationChanged('expense', { category: 'A', payment_method: 'Tarjeta' }, { category: 'A', payment_method: 'Bizum' }), true);
    assert.equal(classificationChanged('income', { category: 'A', source: 'x' }, { category: 'A', source: 'y' }), false);
    assert.equal(learningItemFromRecord('expense', { notes: null, category: 'A' }), null);
    assert.deepEqual(learningItemFromRecord('income', { notes: null, source: 'ACME SL', category: 'Nómina' }), {
        concept: 'ACME SL', direction: 'IN', classification: { destination: 'INCOME', category: 'Nómina', source: 'ACME SL' },
    });
    assert.ok(sameClassification({ destination: 'EXPENSE', category: 'A', source: 'ignorada' }, { destination: 'EXPENSE', category: 'A' }));
});

test('sugerencia de una regla con la forma de la del historial', () => {
    const suggestion = suggestionFromRule(rule({ id: 7, merchant_key: 'netflix', category: 'Suscripciones', payment_method: 'Tarjeta', hits: 2, example: 'NETFLIX.COM' }), 'incluye');
    assert.deepEqual(suggestion, {
        destino: 'gasto', category: 'Suscripciones', subcategory: null, payment_method: 'Tarjeta', expense_type: null,
        confianza: 0.76, veces: 2, parecido_a: 'NETFLIX.COM', origen: 'regla', regla_id: 7, regla_origen: 'aprendida', coincidencia: 'incluye',
    });
    const business = suggestionFromRule(rule({ destination: 'BUSINESS', business_id: 1, account_id: 2, flow_type: 'TAX', category: null, origin: 'MANUAL', merchant_key: 'aeat' }), 'exacta');
    assert.deepEqual([business.destino, business.empresa_id, business.account_id, business.flow_type, business.confianza], ['movimiento_empresa', 1, 2, 'TAX', 1]);
});
