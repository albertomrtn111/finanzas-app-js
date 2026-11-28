// Registro de cambios (los de la IA por el MCP y los de la web) y su deshacer.
// Cada escritura se registra en la misma transacción que el cambio: o se guardan los dos o ninguno.
import prisma from './db.js';
import { saveAllocations } from './businessMovements.js';
import { ENTITIES, SOURCES, newBatchId, planBudgetReplacement, sameRecord, snapshot, webContext, withoutRelations } from './changeRecords.js';

export { ENTITIES, SOURCES, newBatchId, planBudgetReplacement, sameRecord, snapshot, webContext, withoutRelations };

// ctx: { userId, tool, source?, batchId? }. Sin source, el cambio cuenta como hecho desde el MCP.
export async function logChange(client, ctx, { entity, entityId = null, action, before = null, after = null, businessId = null, batchId = null, source = null }) {
    return client.changeLog.create({
        data: {
            user_id: ctx.userId,
            business_id: businessId,
            source: source ?? ctx.source ?? 'MCP',
            tool: ctx.tool || 'desconocida',
            entity,
            entity_id: entityId,
            action,
            before: before === null ? undefined : snapshot(before),
            after: after === null ? undefined : snapshot(after),
            batch_id: batchId ?? ctx.batchId ?? null,
        },
    });
}

// Crear, cambiar o borrar un registro y apuntarlo en el registro de cambios, dentro de la transacción tx.
// where tiene que incluir el dueño (user_id o business_id). extra: { businessId, batchId }.
export async function createLogged(tx, ctx, entity, data, extra = {}) {
    const record = await tx[ENTITIES[entity].model].create({ data });
    await logChange(tx, ctx, { entity, entityId: record.id, action: 'CREATE', after: record, ...extra });
    return record;
}

// Devuelve el registro cambiado o null si no existe (o no es del dueño).
export async function updateLogged(tx, ctx, entity, where, data, extra = {}) {
    const model = tx[ENTITIES[entity].model];
    const before = await model.findFirst({ where });
    if (!before) return null;
    const after = await model.update({ where: { id: before.id }, data });
    await logChange(tx, ctx, { entity, entityId: before.id, action: 'UPDATE', before, after, ...extra });
    return after;
}

// Devuelve el registro borrado o null si no existe (o no es del dueño).
export async function deleteLogged(tx, ctx, entity, where, extra = {}) {
    const model = tx[ENTITIES[entity].model];
    const before = await model.findFirst({ where });
    if (!before) return null;
    await model.delete({ where: { id: before.id } });
    await logChange(tx, ctx, { entity, entityId: before.id, action: 'DELETE', before, ...extra });
    return before;
}

// Crea la categoría personal si todavía no existe (al apuntar un gasto o ingreso con una nueva) y lo registra.
export async function ensureCategoryLogged(tx, ctx, type, name) {
    const model = type === 'income' ? 'incomeCategory' : 'expenseCategory';
    const { count } = await tx[model].createMany({ data: [{ user_id: ctx.userId, name, created_at: new Date() }], skipDuplicates: true });
    if (!count) return null;
    const created = await tx[model].findUnique({ where: { user_id_name: { user_id: ctx.userId, name } } });
    await logChange(tx, ctx, { entity: type === 'income' ? 'income_category' : 'expense_category', entityId: created.id, action: 'CREATE', after: created });
    return created;
}

// Registra los movimientos de empresa recién creados. Los dos de un traspaso van en un mismo lote.
export async function logCreatedMovements(tx, ctx, businessId, created) {
    const batchId = created.transfer ? `traspaso-${created.movements[0].transfer_group}` : null;
    const ids = [];
    for (const movement of created.movements) {
        ids.push((await logChange(tx, ctx, { entity: 'business_movement', entityId: movement.id, action: 'CREATE', after: movement, businessId, batchId })).id);
    }
    return { batchId, ids };
}

// Borra un movimiento de empresa (los dos, si es un traspaso) con sus vínculos con facturas, que
// se guardan en el registro para poder recuperarlos al deshacer.
export async function deleteMovementLogged(tx, ctx, businessId, movement) {
    const targets = await tx.businessMovement.findMany({
        where: { business_id: businessId, ...(movement.transfer_group ? { transfer_group: movement.transfer_group } : { id: movement.id }) },
        include: { allocations: true },
    });
    const batchId = targets.length > 1 ? `borrado-traspaso-${movement.transfer_group}` : null;
    for (const target of targets) {
        await tx.businessMovement.delete({ where: { id: target.id } });
        await logChange(tx, ctx, { entity: 'business_movement', entityId: target.id, action: 'DELETE', before: target, businessId, batchId });
    }
    return { ids: targets.map(target => target.id), batchId };
}

function scopeWhere(entry, config, id) {
    return config.scope === 'user' ? { id, user_id: entry.user_id } : { id, business_id: entry.business_id };
}

async function renameCategory(tx, userId, type, from, to) {
    if (type === 'income') {
        await tx.incomeCategory.updateMany({ where: { user_id: userId, name: from }, data: { name: to } });
        await tx.income.updateMany({ where: { user_id: userId, category: from }, data: { category: to } });
    } else {
        await tx.expenseCategory.updateMany({ where: { user_id: userId, name: from }, data: { name: to } });
        await tx.expense.updateMany({ where: { user_id: userId, category: from }, data: { category: to } });
        await tx.budget.updateMany({ where: { user_id: userId, category: from }, data: { category: to } });
    }
}

export { renameCategory };

// Deshacer la creación de una cuenta o de una operación no puede llevarse por delante movimientos,
// cobros o pagos registrados después (ni siquiera con forzar): hay que quitarlos antes.
async function assertNothingLinked(tx, entry, id) {
    if (entry.entity === 'business_account') {
        const count = await tx.businessMovement.count({ where: { account_id: id, business_id: entry.business_id } });
        if (count) throw new Error(`La cuenta de empresa ${id} tiene ${count === 1 ? 'un movimiento' : `${count} movimientos`}; bórra${count === 1 ? 'lo' : 'los'} antes de deshacer su creación`);
    }
    if (entry.entity === 'business_activity') {
        const count = await tx.businessAllocation.count({ where: { activity_id: id, business_id: entry.business_id } });
        if (count) throw new Error(`La operación de empresa ${id} tiene cobros o pagos vinculados; desvincúlalos antes de deshacer su creación`);
    }
}

async function revertEntry(tx, entry, force) {
    const config = ENTITIES[entry.entity];
    if (!config) throw new Error(`No sé deshacer cambios de tipo ${entry.entity}`);
    if (config.scope === 'business') {
        const owned = await tx.business.findFirst({ where: { id: entry.business_id ?? -1, owner_user_id: entry.user_id } });
        if (!owned) throw new Error('La empresa del cambio ya no existe');
    }

    if (entry.entity === 'business_movement_links') {
        const movementId = entry.entity_id;
        const movement = await tx.businessMovement.findFirst({ where: { id: movementId, business_id: entry.business_id } });
        if (!movement) throw new Error(`El movimiento ${movementId} ya no existe`);
        // Se vuelven a validar: las facturas pueden haberse saldado con otros movimientos después.
        const error = await saveAllocations(tx, entry.business_id, movement, (entry.before || []).map(link => ({ activity_id: link.activity_id, amount: String(link.amount) })));
        if (error) throw new Error(`No se pueden restaurar los vínculos del movimiento ${movementId}: ${error}`);
        return `Restaurados los vínculos del movimiento ${movementId}`;
    }

    if (entry.action === 'RENAME') {
        const type = entry.entity === 'income_category' ? 'income' : 'expense';
        await renameCategory(tx, entry.user_id, type, entry.after.name, entry.before.name);
        return `Categoría «${entry.after.name}» vuelve a llamarse «${entry.before.name}»`;
    }

    const model = tx[config.model];
    const id = entry.entity_id;
    const current = id ? await model.findFirst({ where: scopeWhere(entry, config, id) }) : null;

    if (entry.action === 'CREATE') {
        if (!current) return `El ${config.label} ${id} ya no existía`;
        if (!force && !sameRecord(current, entry.after)) throw new Error(`El ${config.label} ${id} ha cambiado después; usa forzar para borrarlo igualmente`);
        await assertNothingLinked(tx, entry, id);
        await model.deleteMany({ where: scopeWhere(entry, config, id) }).catch(error => {
            // La base de datos impide borrar una cuenta con movimientos o una operación con cobros o pagos.
            throw error?.code === 'P2003' ? new Error(`El ${config.label} ${id} tiene movimientos, cobros o pagos registrados después; bórralos o desvincúlalos antes de deshacer`) : error;
        });
        return `Borrado el ${config.label} ${id} que se había creado`;
    }

    if (entry.action === 'UPDATE') {
        if (!current) throw new Error(`El ${config.label} ${id} ya no existe`);
        if (!force && !sameRecord(current, entry.after)) throw new Error(`El ${config.label} ${id} ha cambiado después; usa forzar para restaurarlo igualmente`);
        const { id: _id, created_at: _created, updated_at: _updated, allocations: _allocations, ...data } = entry.before;
        await model.update({ where: { id }, data });
        return `Restaurado el ${config.label} ${id} a su estado anterior`;
    }

    if (entry.action === 'DELETE') {
        if (current) return `El ${config.label} ${id} ya existe`;
        const { allocations, updated_at: _updated, ...data } = entry.before;
        const restored = await model.create({ data });
        if (entry.entity === 'business_movement' && Array.isArray(allocations) && allocations.length) {
            const error = await saveAllocations(tx, entry.business_id, restored, allocations.map(link => ({ activity_id: link.activity_id, amount: String(link.amount) })));
            if (error) throw new Error(`No se puede recuperar el ${config.label} ${id} con sus facturas: ${error}`);
        }
        return `Recuperado el ${config.label} ${id}`;
    }
    throw new Error(`Acción desconocida: ${entry.action}`);
}

// Deshace cambios por id o por lote, del más reciente al más antiguo, en una sola transacción.
export async function revertChanges(ctx, { ids = [], batchId = null, force = false }) {
    const where = { user_id: ctx.userId, reverted_at: null, ...(batchId ? { batch_id: batchId } : { id: { in: ids } }) };
    const entries = await prisma.changeLog.findMany({ where, orderBy: { id: 'desc' } });
    if (!entries.length) return { reverted: [], message: 'No hay cambios pendientes de deshacer con esos datos' };
    const results = await prisma.$transaction(async tx => {
        const done = [];
        for (const entry of entries) {
            // Se marca primero dentro de la transacción: si otra petición ya lo deshizo, se para aquí.
            const claimed = await tx.changeLog.updateMany({ where: { id: entry.id, user_id: ctx.userId, reverted_at: null }, data: { reverted_at: new Date() } });
            if (!claimed.count) throw new Error(`El cambio ${entry.id} ya se ha deshecho`);
            const message = await revertEntry(tx, entry, force);
            done.push({ cambio: entry.id, resultado: message });
        }
        return done;
    }, { timeout: 120000, maxWait: 10000 });
    return { reverted: results };
}
