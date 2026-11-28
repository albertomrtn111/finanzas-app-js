// Reglas de clasificación en la base de datos (Tarea NF-4): aprender de importaciones y correcciones
// (personales y de empresa), y crear, editar o borrar reglas manuales. Todo dentro de la transacción del
// cambio y en el registro de cambios, para que deshacer una importación o una corrección deshaga también
// lo aprendido. Las reglas puras (coincidencia, confianza, qué aprender) están en src/lib/classificationRules.js.
import prisma from './db.js';
import { logChange, newBatchId } from './changeLog.js';
import {
    activityCorrectionItems, classificationChanged, learningItemFromRecord, linkCorrectionItem, movementCategory, parseRuleInput, planLearning,
} from './classificationRules.js';

export const RULE_ENTITY = 'classification_rule';

export class RuleError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export function loadRules(client, userId) {
    return client.classificationRule.findMany({ where: { user_id: userId }, orderBy: { id: 'asc' } });
}

// Aprende de movimientos ya guardados en tx: items [{ concept, direction, classification }].
// rules: las reglas del usuario si ya se han leído en esta transacción. Cada regla cambiada queda en el
// registro de cambios con la acción LEARN y el lote de ctx. Devuelve { creadas, actualizadas, resultados }.
export async function learnClassifications(tx, ctx, items, { rules = null, plan = null } = {}) {
    const usable = items.filter(Boolean);
    if (!usable.length) return { creadas: 0, actualizadas: 0, resultados: [] };
    const current = rules ?? await loadRules(tx, ctx.userId);
    const { writes, results } = plan ?? planLearning(current, usable);
    const saved = new Map();
    let creadas = 0;
    let actualizadas = 0;
    for (const write of writes) {
        if (write.type === 'create') {
            // Si otra petición acaba de crear la misma regla, no se pisa: la importación sigue adelante.
            const { count } = await tx.classificationRule.createMany({ data: [{ user_id: ctx.userId, ...write.data }], skipDuplicates: true });
            if (!count) continue;
            const created = await tx.classificationRule.findUnique({
                where: { user_id_direction_merchant_key_pattern: { user_id: ctx.userId, direction: write.data.direction, merchant_key: write.data.merchant_key, pattern: write.data.pattern } },
            });
            await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: created.id, action: 'LEARN', after: created });
            saved.set(write.rule, created);
            creadas += 1;
            continue;
        }
        const before = await tx.classificationRule.findFirst({ where: { id: write.id, user_id: ctx.userId } });
        if (!before) continue;
        const after = await tx.classificationRule.update({ where: { id: before.id }, data: write.data });
        await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: after.id, action: 'LEARN', before, after });
        saved.set(write.rule, after);
        actualizadas += 1;
    }
    const resultados = results.map(result => ({ accion: result.accion, regla_id: saved.get(result.rule)?.id ?? result.rule?.id ?? null }));
    return { creadas, actualizadas, resultados };
}

// Prepara una corrección que puede enseñar reglas. items: lo que se aprende ([{ concept, direction,
// classification }]; los null se ignoran). Si se aprende algo, el cambio y lo aprendido van en un mismo
// lote «correccion-…» para deshacerlos juntos: quien llama registra su cambio con el ctx devuelto y
// después llama a learn(), todo en la misma transacción. Las reglas manuales nunca se cambian: sus ids
// salen en manualRules para avisar al usuario.
// Devuelve { ctx, batchId (o null), manualRules, learn }.
export async function prepareCorrection(tx, ctx, items) {
    const usable = items.filter(Boolean);
    const rules = usable.length ? await loadRules(tx, ctx.userId) : [];
    const plan = usable.length ? planLearning(rules, usable) : { writes: [], results: [] };
    const learns = plan.writes.length > 0;
    const change = learns ? { ...ctx, batchId: ctx.batchId ?? newBatchId('correccion') } : ctx;
    return {
        ctx: change,
        batchId: learns ? change.batchId : null,
        manualRules: [...new Set(plan.results.filter(result => result.accion === 'manda_manual').map(result => result.rule.id))],
        learn: async () => (learns ? learnClassifications(tx, change, usable, { rules, plan }) : null),
    };
}

// Edita un gasto o ingreso (where incluye el dueño) y, si cambia su categoría, subcategoría, método de
// pago o tipo (fijo o variable), aprende la regla de su comercio. Si se aprende algo, la edición, lo
// aprendido y la categoría nueva (con el ctx devuelto) van en un mismo lote para deshacerlos juntos.
// Devuelve null si el registro no existe o no es del usuario.
export async function updatePersonalAndLearn(tx, ctx, kind, where, data) {
    const before = await tx[kind].findFirst({ where });
    if (!before) return null;
    const next = { ...before, ...data };
    const correction = await prepareCorrection(tx, ctx, [classificationChanged(kind, before, next) ? learningItemFromRecord(kind, next) : null]);
    const after = await tx[kind].update({ where: { id: before.id }, data });
    const log = await logChange(tx, correction.ctx, { entity: kind, entityId: before.id, action: 'UPDATE', before, after });
    const learned = await correction.learn();
    return { record: after, log, ctx: correction.ctx, batchId: correction.batchId, learned, manualRule: correction.manualRules[0] ?? null };
}

// --- Correcciones de empresa ----------------------------------------------------------------------
// Un movimiento de empresa no se edita (se crea y se borra), así que lo que se corrige de él es su
// categoría: la de las facturas que salda. Ver src/lib/classificationRules.js.

// Vínculos de un movimiento con la categoría de su factura: [{ activity_id, amount, category }].
async function linksWithCategory(tx, businessId, links) {
    const ids = [...new Set(links.map(link => link.activity_id))];
    const activities = ids.length
        ? await tx.businessActivity.findMany({ where: { id: { in: ids }, business_id: businessId }, select: { id: true, category: true } })
        : [];
    const categories = new Map(activities.map(activity => [activity.id, activity.category]));
    return links.map(link => ({ activity_id: link.activity_id, amount: link.amount, category: categories.get(link.activity_id) ?? null }));
}

// Categoría de empresa de unos vínculos [{ activity_id, amount }] (la de la factura con más importe), o null.
export async function categoryOfLinks(tx, businessId, links) {
    return movementCategory(await linksWithCategory(tx, businessId, links.map(link => ({ ...link, activity_id: Number(link.activity_id) }))));
}

// Corrección al vincular un movimiento de empresa con facturas (o cambiar sus vínculos): before y after
// son sus vínculos antes y después. Enseña la regla de su concepto si su categoría cambia.
export async function prepareLinkCorrection(tx, ctx, businessId, movement, before, after) {
    const links = await linksWithCategory(tx, businessId, [...before, ...after]);
    return prepareCorrection(tx, ctx, [linkCorrectionItem(movement, links.slice(0, before.length), links.slice(before.length))]);
}

// Corrección al cambiar la categoría de una operación (factura) de empresa, antes de guardarla: enseña
// la regla del concepto de cada cobro o pago vinculado a ella. Sin cobros ni pagos no hay concepto del
// banco con que reconocerla, así que no se aprende nada.
export async function prepareActivityCorrection(tx, ctx, businessId, activity, nextCategory) {
    if ((activity.category ?? '') === (nextCategory ?? '')) return prepareCorrection(tx, ctx, []);
    const movements = await tx.businessMovement.findMany({
        where: { business_id: businessId, allocations: { some: { activity_id: activity.id } } },
        orderBy: { id: 'asc' },
        include: { allocations: { orderBy: { id: 'asc' }, include: { activity: { select: { category: true } } } } },
    });
    const withLinks = movements.map(({ allocations, ...movement }) => ({
        ...movement,
        links: allocations.map(link => ({ activity_id: link.activity_id, amount: link.amount, category: link.activity.category })),
    }));
    return prepareCorrection(tx, ctx, activityCorrectionItems(withLinks, activity.id, nextCategory));
}

// Lo aprendido en una corrección, para la respuesta de la IA.
export function correctionSummary(correction, learned) {
    return {
        ...(correction.batchId ? {
            lote: correction.batchId,
            aprendido: { reglas_creadas: learned?.creadas ?? 0, reglas_actualizadas: learned?.actualizadas ?? 0 },
            como_deshacer: `deshacer_cambio con lote «${correction.batchId}» deshace la corrección y lo aprendido`,
        } : {}),
        ...(correction.manualRules.length ? {
            reglas_manuales: correction.manualRules,
            aviso: correction.manualRules.length === 1
                ? `La regla manual ${correction.manualRules[0]} manda para este comercio y no se ha cambiado. Si quieres que la próxima vez se proponga lo nuevo, edítala con gestionar_regla_clasificacion.`
                : `Las reglas manuales ${correction.manualRules.join(', ')} mandan para estos comercios y no se han cambiado. Si quieres que la próxima vez se proponga lo nuevo, edítalas con gestionar_regla_clasificacion.`,
        } : {}),
    };
}

// La empresa y la cuenta tienen que ser del usuario, y lo personal, de una cuenta con espacio personal.
async function assertTargets(tx, userId, value, personal) {
    if (value.destination !== 'BUSINESS') {
        if (!personal) throw new RuleError('Esta cuenta no tiene espacio personal: la regla solo puede mandar a una empresa');
        return;
    }
    const business = await tx.business.findFirst({ where: { id: value.business_id, owner_user_id: userId }, select: { id: true } });
    if (!business) throw new RuleError(`No existe la empresa ${value.business_id} o no es tuya`, 404);
    const account = await tx.businessAccount.findFirst({ where: { id: value.account_id, business_id: business.id }, select: { id: true } });
    if (!account) throw new RuleError(`La cuenta ${value.account_id} no es de esa empresa`, 404);
}

async function assertFreeKey(tx, userId, value, exceptId = null) {
    const other = await tx.classificationRule.findUnique({
        where: { user_id_direction_merchant_key_pattern: { user_id: userId, direction: value.direction, merchant_key: value.merchant_key, pattern: value.pattern } },
        select: { id: true },
    });
    if (other && other.id !== exceptId) throw new RuleError(`Ya hay una regla para ese comercio y sentido (regla ${other.id}). Edítala en lugar de crear otra`, 409);
}

function parsed(input, existing) {
    const { value, error } = parseRuleInput(input, existing);
    if (error) throw new RuleError(error);
    return value;
}

// Reglas de una sola empresa (la página de reglas de esa empresa): la regla tiene que ir a ella.
const inBusiness = (input, businessId) => (businessId ? { ...input, destination: 'BUSINESS', business_id: businessId } : input);
const ruleWhere = (ctx, id, businessId) => ({ id, user_id: ctx.userId, ...(businessId ? { business_id: businessId } : {}) });

// Crea una regla manual. personal: si la cuenta tiene espacio personal; businessId: solo de esa
// empresa. Devuelve { rule, log }.
export async function createManualRule(tx, ctx, input, { personal, businessId = null }) {
    const value = parsed(inBusiness(input, businessId));
    await assertTargets(tx, ctx.userId, value, personal);
    await assertFreeKey(tx, ctx.userId, value);
    const rule = await tx.classificationRule.create({ data: { user_id: ctx.userId, ...value, origin: 'MANUAL', hits: 0 } });
    const log = await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: rule.id, action: 'CREATE', after: rule });
    return { rule, log };
}

// Edita una regla del usuario; pasa a ser manual y el aprendizaje ya no la cambia.
// merge: lo que no venga en input se queda como está (MCP); sin merge, input es la regla entera (web).
// businessId: solo una regla de esa empresa, que sigue siendo de ella.
export async function updateManualRule(tx, ctx, id, input, { personal, merge = false, businessId = null }) {
    const before = await tx.classificationRule.findFirst({ where: ruleWhere(ctx, id, businessId) });
    if (!before) throw new RuleError(`No existe la regla ${id}`, 404);
    const value = parsed(inBusiness(input, businessId), merge ? before : null);
    await assertTargets(tx, ctx.userId, value, personal);
    await assertFreeKey(tx, ctx.userId, value, before.id);
    const rule = await tx.classificationRule.update({ where: { id: before.id }, data: { ...value, origin: 'MANUAL' } });
    const log = await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: rule.id, action: 'UPDATE', before, after: rule });
    return { rule, log };
}

// Borra una regla del usuario (con businessId, solo si es de esa empresa). Si era aprendida, se
// volverá a aprender con la próxima importación o corrección. Devuelve { rule, log }.
export async function deleteRule(tx, ctx, id, { businessId = null } = {}) {
    const rule = await tx.classificationRule.findFirst({ where: ruleWhere(ctx, id, businessId) });
    if (!rule) throw new RuleError(`No existe la regla ${id}`, 404);
    await tx.classificationRule.delete({ where: { id: rule.id } });
    const log = await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: rule.id, action: 'DELETE', before: rule });
    return { rule, log };
}

// Reglas del usuario con el nombre de su empresa y cuenta (solo si son suyas).
export async function listRules(userId, where = {}, { take, skip } = {}) {
    const rules = await prisma.classificationRule.findMany({
        where: { ...where, user_id: userId },
        orderBy: [{ last_used_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        include: { business: { select: { name: true, owner_user_id: true } }, account: { select: { name: true, business_id: true } } },
        ...(take ? { take } : {}), ...(skip ? { skip } : {}),
    });
    return rules.map(({ business, account, ...rule }) => {
        const own = business?.owner_user_id === userId;
        return { ...rule, business_name: own ? business.name : null, account_name: own && account?.business_id === rule.business_id ? account.name : null };
    });
}
