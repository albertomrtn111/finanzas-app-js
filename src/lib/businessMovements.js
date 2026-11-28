// Reglas de los movimientos de dinero de empresa, compartidas por la API y el MCP.
import { randomUUID } from 'node:crypto';
import prisma, { Prisma } from './db.js';
import { FLOW_TYPES, appDate, cents, cleanText, money, todayInMadrid } from './business.js';

export { FLOW_TYPES };

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export class MovementError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export async function saveAllocations(tx, businessId, movement, raw) {
    if (!Array.isArray(raw) || raw.length > 30) return 'Vínculos de factura inválidos';
    const used = new Set();
    let allocated = 0;
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return 'Cada vínculo de factura necesita activity_id e importe';
        const activityId = validId(item.activity_id);
        const amount = cents(item.amount);
        if (!activityId || !amount) return 'Vínculo de factura inválido: indica la operación y un importe mayor que 0 con hasta dos decimales';
        if (used.has(activityId)) return 'La misma factura aparece dos veces en los vínculos';
        used.add(activityId);
        allocated += amount;
        const activity = await tx.businessActivity.findFirst({ where: { id: activityId, business_id: businessId }, include: { allocations: true } });
        if (!activity) return 'Factura no encontrada';
        if ((activity.direction === 'INCOME') !== (Number(movement.amount) > 0)) return 'El signo del movimiento no coincide con el cobro o pago';
        const already = activity.allocations.filter(a => a.movement_id !== movement.id).reduce((sum, a) => sum + cents(a.amount), 0);
        if (already + amount > cents(activity.total_amount)) return 'El importe vinculado supera el pendiente de la factura';
    }
    if (allocated > Math.abs(cents(movement.amount, { allowNegative: true }))) return 'El importe vinculado supera el movimiento';
    await tx.businessAllocation.deleteMany({ where: { movement_id: movement.id, business_id: businessId } });
    for (const item of raw) {
        await tx.businessAllocation.create({ data: { business_id: businessId, movement_id: movement.id, activity_id: Number(item.activity_id), amount: money(cents(item.amount)) } });
    }
    return null;
}

// Crea un cobro, pago o traspaso dentro de una transacción ya abierta.
// Devuelve { movements, transfer } o lanza MovementError.
export async function insertBusinessMovement(tx, businessId, body) {
    const date = appDate(body.date);
    const amount = cents(body.amount);
    const description = cleanText(body.description, 240, true);
    if (!date || !amount || !description || body.date > todayInMadrid()) {
        throw new MovementError('Completa fecha, concepto e importe válido. Para fechas futuras usa Previsión.');
    }

    if (body.flow_type === 'TRANSFER') {
        const fromId = validId(body.from_account_id);
        const toId = validId(body.to_account_id);
        if (!fromId || !toId || fromId === toId) throw new MovementError('Elige dos cuentas distintas');
        const accounts = await tx.businessAccount.findMany({ where: { id: { in: [fromId, toId] }, business_id: businessId } });
        if (accounts.length !== 2 || accounts.some(a => date < a.opening_on)) throw new MovementError('Cuentas o fecha inválidas');
        const group = randomUUID();
        const movements = [
            await tx.businessMovement.create({ data: { business_id: businessId, account_id: fromId, date, amount: money(-amount), description, flow_type: 'TRANSFER', transfer_group: group } }),
            await tx.businessMovement.create({ data: { business_id: businessId, account_id: toId, date, amount: money(amount), description, flow_type: 'TRANSFER', transfer_group: group } }),
        ];
        return { movements, transfer: true };
    }

    const accountId = validId(body.account_id);
    const flowType = body.flow_type || 'OPERATING';
    const sign = body.direction === 'OUT' ? -1 : body.direction === 'IN' ? 1 : 0;
    if (!accountId || !FLOW_TYPES.includes(flowType) || !sign) throw new MovementError('Cuenta, sentido o tipo de flujo inválidos');
    const account = await tx.businessAccount.findFirst({ where: { id: accountId, business_id: businessId } });
    if (!account || date < account.opening_on) throw new MovementError('La cuenta no existe o el movimiento precede a su saldo inicial');
    const created = await tx.businessMovement.create({ data: { business_id: businessId, account_id: accountId, date, amount: money(sign * amount), description, flow_type: flowType } });
    const error = await saveAllocations(tx, businessId, created, body.allocations || []);
    if (error) throw new MovementError(error);
    return { movements: [created], transfer: false };
}

// Crea un cobro, pago o traspaso en su propia transacción. Devuelve { movements, transfer } o { error, status }.
// onCreated(tx, created) corre dentro de la misma transacción (p. ej., para el registro de cambios).
export async function createBusinessMovement(businessId, body, { onCreated } = {}) {
    try {
        return await prisma.$transaction(async tx => {
            const created = await insertBusinessMovement(tx, businessId, body);
            if (onCreated) await onCreated(tx, created);
            return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        if (error.code === 'P2034') return { error: 'Otro cambio modificó los pendientes. Vuelve a intentarlo.', status: 409 };
        if (error instanceof MovementError) return { error: error.message, status: error.status };
        throw error;
    }
}

// Sustituye los vínculos de un movimiento con facturas. Devuelve { movement, before, after } o { error, status }.
// onReplaced(tx, result) corre dentro de la misma transacción (p. ej., para el registro de cambios).
export async function replaceAllocations(businessId, movementId, allocations, { onReplaced } = {}) {
    try {
        return await prisma.$transaction(async tx => {
            const movement = await tx.businessMovement.findFirst({ where: { id: movementId, business_id: businessId }, include: { allocations: true } });
            if (!movement) return { status: 404, error: 'Movimiento no encontrado' };
            if (movement.flow_type === 'TRANSFER') return { status: 409, error: 'Las transferencias no se vinculan a facturas' };
            const error = await saveAllocations(tx, businessId, movement, allocations);
            if (error) throw new MovementError(error);
            const after = await tx.businessAllocation.findMany({ where: { movement_id: movementId, business_id: businessId } });
            const result = { movement, before: movement.allocations, after };
            if (onReplaced) await onReplaced(tx, result);
            return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        if (error.code === 'P2034') return { error: 'Los pendientes han cambiado. Vuelve a intentarlo.', status: 409 };
        if (error instanceof MovementError) return { error: error.message, status: error.status };
        throw error;
    }
}
