// Registro de cambios del MCP y su deshacer.
import prisma from '../db.js';
import { saveAllocations } from '../businessMovements.js';
import { snapshot } from './serialize.js';

// Entidad registrada → modelo de Prisma y ámbito de propiedad.
export const ENTITIES = {
    expense: { model: 'expense', scope: 'user', label: 'gasto' },
    income: { model: 'income', scope: 'user', label: 'ingreso' },
    cash_snapshot: { model: 'cashSnapshot', scope: 'user', label: 'saldo de efectivo' },
    investment: { model: 'investment', scope: 'user', label: 'registro de inversión' },
    investment_product: { model: 'investmentProduct', scope: 'user', label: 'producto de inversión' },
    budget: { model: 'budget', scope: 'user', label: 'presupuesto' },
    expense_category: { model: 'expenseCategory', scope: 'user', label: 'categoría de gasto' },
    income_category: { model: 'incomeCategory', scope: 'user', label: 'categoría de ingreso' },
    business_activity: { model: 'businessActivity', scope: 'business', label: 'operación de empresa' },
    business_movement: { model: 'businessMovement', scope: 'business', label: 'movimiento de empresa' },
    business_account: { model: 'businessAccount', scope: 'business', label: 'cuenta de empresa' },
    business_cash_plan: { model: 'businessCashPlan', scope: 'business', label: 'previsión de empresa' },
    business_budget: { model: 'businessBudget', scope: 'business', label: 'presupuesto de empresa' },
    business_movement_links: { scope: 'business', label: 'vínculos de movimiento con facturas' },
};

const IGNORED_FIELDS = new Set(['updated_at', 'allocations']);

export async function logChange(client, ctx, { entity, entityId = null, action, before = null, after = null, businessId = null, batchId = null }) {
    return client.changeLog.create({
        data: {
            user_id: ctx.userId,
            business_id: businessId,
            source: 'MCP',
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

function scalars(record) {
    const result = {};
    for (const [key, value] of Object.entries(record || {})) {
        if (!IGNORED_FIELDS.has(key)) result[key] = value;
    }
    return result;
}

// JSON con las claves ordenadas: PostgreSQL (JSONB) no conserva el orden original.
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

export function sameRecord(current, expected) {
    return canonical(scalars(snapshot(current))) === canonical(scalars(snapshot(expected)));
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
        await model.deleteMany({ where: scopeWhere(entry, config, id) });
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
