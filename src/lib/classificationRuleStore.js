// Reglas de clasificación en la base de datos (Tarea NF-4): aprender de importaciones y correcciones,
// y crear, editar o borrar reglas manuales. Todo dentro de la transacción del cambio y en el registro
// de cambios, para que deshacer una importación o una corrección deshaga también lo aprendido.
// Las reglas puras (coincidencia, confianza, qué aprender) están en src/lib/classificationRules.js.
import prisma from './db.js';
import { logChange, newBatchId } from './changeLog.js';
import { classificationChanged, learningItemFromRecord, parseRuleInput, planLearning } from './classificationRules.js';

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

// Edita un gasto o ingreso (where incluye el dueño) y, si cambia su categoría, subcategoría o
// método de pago, aprende la regla de su comercio. Si se aprende algo, la edición, lo aprendido y
// la categoría nueva (con el ctx devuelto) van en un mismo lote para deshacerlos juntos.
// Devuelve null si el registro no existe o no es del usuario.
export async function updatePersonalAndLearn(tx, ctx, kind, where, data) {
    const before = await tx[kind].findFirst({ where });
    if (!before) return null;
    const item = classificationChanged(kind, before, { ...before, ...data }) ? learningItemFromRecord(kind, { ...before, ...data }) : null;
    const rules = item ? await loadRules(tx, ctx.userId) : null;
    const plan = item ? planLearning(rules, [item]) : null;
    const learns = Boolean(plan?.writes.length);
    const change = learns ? { ...ctx, batchId: ctx.batchId ?? newBatchId('correccion') } : ctx;
    const after = await tx[kind].update({ where: { id: before.id }, data });
    const log = await logChange(tx, change, { entity: kind, entityId: before.id, action: 'UPDATE', before, after });
    const learned = learns ? await learnClassifications(tx, change, [item], { rules, plan }) : null;
    return {
        record: after, log, ctx: change,
        batchId: learns ? change.batchId : null,
        learned,
        manualRule: plan?.results[0]?.accion === 'manda_manual' ? plan.results[0].rule.id : null,
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

// Crea una regla manual. personal: si la cuenta tiene espacio personal. Devuelve { rule, log }.
export async function createManualRule(tx, ctx, input, { personal }) {
    const value = parsed(input);
    await assertTargets(tx, ctx.userId, value, personal);
    await assertFreeKey(tx, ctx.userId, value);
    const rule = await tx.classificationRule.create({ data: { user_id: ctx.userId, ...value, origin: 'MANUAL', hits: 0 } });
    const log = await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: rule.id, action: 'CREATE', after: rule });
    return { rule, log };
}

// Edita una regla del usuario; pasa a ser manual y el aprendizaje ya no la cambia.
// merge: lo que no venga en input se queda como está (MCP); sin merge, input es la regla entera (web).
export async function updateManualRule(tx, ctx, id, input, { personal, merge = false }) {
    const before = await tx.classificationRule.findFirst({ where: { id, user_id: ctx.userId } });
    if (!before) throw new RuleError(`No existe la regla ${id}`, 404);
    const value = parsed(input, merge ? before : null);
    await assertTargets(tx, ctx.userId, value, personal);
    await assertFreeKey(tx, ctx.userId, value, before.id);
    const rule = await tx.classificationRule.update({ where: { id: before.id }, data: { ...value, origin: 'MANUAL' } });
    const log = await logChange(tx, ctx, { entity: RULE_ENTITY, entityId: rule.id, action: 'UPDATE', before, after: rule });
    return { rule, log };
}

// Borra una regla del usuario. Si era aprendida, se volverá a aprender con la próxima importación.
// Devuelve { rule, log }.
export async function deleteRule(tx, ctx, id) {
    const rule = await tx.classificationRule.findFirst({ where: { id, user_id: ctx.userId } });
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
