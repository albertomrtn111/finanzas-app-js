import * as z from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../db.js';
import { activityInput, appDate, cents, cleanText, closedQuarterMessage, closedQuartersTouched, money, outstanding, summarizeBusiness, todayInMadrid } from '../../business.js';
import { FLOW_TYPES, MovementError, insertBusinessMovement, replaceAllocations } from '../../businessMovements.js';
import { logChange } from '../changeLog.js';
import { dateKey } from '../serialize.js';
import { DELETE, READ, ToolError, WRITE, amountText, dateFilter, defineTool, fecha, id, importe, requireBusiness } from '../toolkit.js';

const empresa = id.describe('Id de la empresa (ver_contexto)');
const direccion = z.enum(['INCOME', 'EXPENSE']).describe('INCOME = ingreso o venta; EXPENSE = gasto o compra');

const taxLine = z.object({
    base: importe.describe('Base imponible sin IVA'),
    vat_rate: z.number().min(0).max(100).describe('Tipo de IVA en %, p. ej. 21'),
    vat_treatment: z.enum(['DOMESTIC', 'EXEMPT', 'NON_SUBJECT']).default('DOMESTIC'),
    deductible_percent: z.number().min(0).max(100).optional().describe('Solo gastos: % de IVA deducible (por defecto 100)'),
});

function activityBody(input, existing) {
    const base = existing ? {
        direction: existing.direction, description: existing.description, category: existing.category,
        occurred_on: dateKey(existing.occurred_on), due_on: existing.due_on ? dateKey(existing.due_on) : null,
        counterparty_name: existing.counterparty_name, counterparty_tax_id: existing.counterparty_tax_id,
        document_kind: existing.document_kind, document_number: existing.document_number,
        document_date: existing.document_date ? dateKey(existing.document_date) : null,
        vat_period: existing.vat_period, tax_lines: existing.tax_lines,
        withholding_rate: Number(existing.base_amount) ? Math.round((Number(existing.withholding_amount) / Number(existing.base_amount)) * 10000) / 100 : 0,
    } : {};
    const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    // Si cambia la fecha de la factura y no se indica periodo, se recalcula el trimestre de IVA.
    if (existing && input.document_date !== undefined && input.vat_period === undefined) merged.vat_period = null;
    if (Array.isArray(merged.tax_lines)) merged.tax_lines = merged.tax_lines.map(line => ({ ...line, base: amountText(String(line.base)) }));
    for (const key of ['counterparty_name', 'counterparty_tax_id', 'document_number']) if (merged[key] === null) merged[key] = '';
    const { value, error } = activityInput(merged);
    if (error) throw new ToolError(error);
    return value;
}

const confirmarTrimestre = z.boolean().optional().describe('Pon true solo después de que el usuario confirme que quiere cambiar o borrar una factura de un trimestre de IVA ya terminado (puede estar declarado)');

// Una factura de un trimestre de IVA ya terminado solo se cambia o borra con la confirmación expresa del usuario.
function requireClosedQuarterConfirmation(periods, action, confirmed) {
    if (periods.length && !confirmed) {
        throw new ToolError(`${closedQuarterMessage(periods, action)} Explícaselo al usuario y, si lo confirma, repite la llamada con confirmar_trimestre_cerrado: true.`);
    }
}

function withOutstanding(activity) {
    return { ...activity, pendiente: money(outstanding(activity)) };
}

export function registerBusinessTools(server, ctx) {
    defineTool(server, ctx, 'resumen_empresa', {
        title: 'Resumen financiero de una empresa',
        description: 'Líquido por cuenta, resultado de gestión del mes (devengo), pendientes de cobro y pago (y vencidos), flujo de caja del mes, previsión de tesorería a 30 y 90 días e IVA orientativo del trimestre. Con mes (AAAA-MM), añade presupuesto frente a real por categoría.',
        input: { empresa_id: empresa, mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() },
        annotations: READ,
    }, async ({ empresa_id, mes }, c) => {
        const business = await requireBusiness(c, empresa_id);
        const where = { business_id: business.id };
        const [accounts, activities, movements, plans] = await Promise.all([
            prisma.businessAccount.findMany({ where }),
            prisma.businessActivity.findMany({ where, include: { allocations: true } }),
            prisma.businessMovement.findMany({ where }),
            prisma.businessCashPlan.findMany({ where }),
        ]);
        const result = { empresa: { id: business.id, nombre: business.name }, ...summarizeBusiness({ accounts, activities, movements, plans }) };
        if (mes) {
            const budgets = await prisma.businessBudget.findMany({ where: { ...where, period: mes } });
            const actual = new Map();
            for (const a of activities.filter(x => dateKey(x.occurred_on).startsWith(mes))) {
                const key = `${a.direction}|${a.category}`;
                const amount = cents(a.base_amount, { allowZero: true }) + (a.direction === 'EXPENSE' ? cents(a.vat_amount, { allowZero: true }) - cents(a.deductible_vat, { allowZero: true }) : 0);
                actual.set(key, (actual.get(key) || 0) + amount);
            }
            const keys = new Set([...actual.keys(), ...budgets.map(b => `${b.direction}|${b.category}`)]);
            result.presupuesto_vs_real = [...keys].map(key => {
                const [direction, category] = key.split('|');
                const budget = budgets.find(b => b.direction === direction && b.category === category);
                const real = actual.get(key) || 0;
                const planned = budget ? cents(budget.amount) : null;
                return { tipo: direction, categoria: category, real: money(real), presupuesto: planned === null ? null : money(planned), desviacion: planned === null ? null : money(real - planned) };
            });
        }
        return result;
    });

    defineTool(server, ctx, 'buscar_operaciones_empresa', {
        title: 'Buscar operaciones (ingresos y gastos) de empresa',
        description: 'Ingresos y gastos por devengo, con o sin factura, con su pendiente de cobro o pago. Filtra por tipo, fechas de devengo, categoría, texto (concepto, contraparte o número de factura) o solo pendientes.',
        input: {
            empresa_id: empresa, tipo: direccion.optional(), desde: fecha.optional(), hasta: fecha.optional(),
            categoria: z.string().max(100).optional(), texto: z.string().max(100).optional(), solo_pendientes: z.boolean().default(false),
            limite: z.number().int().min(1).max(500).default(100),
        },
        annotations: READ,
    }, async (args, c) => {
        const business = await requireBusiness(c, args.empresa_id);
        const text = args.texto ? { OR: ['description', 'counterparty_name', 'document_number'].map(f => ({ [f]: { contains: args.texto, mode: 'insensitive' } })) } : {};
        const activities = await prisma.businessActivity.findMany({
            where: { business_id: business.id, ...(args.tipo ? { direction: args.tipo } : {}), occurred_on: dateFilter(args.desde, args.hasta), ...(args.categoria ? { category: args.categoria } : {}), ...text },
            orderBy: [{ occurred_on: 'desc' }, { id: 'desc' }],
            take: args.solo_pendientes ? undefined : args.limite,
            include: { allocations: { select: { id: true, amount: true, movement_id: true } }, attachments: { select: { id: true, filename: true } } },
        });
        const rows = activities.map(withOutstanding);
        return (args.solo_pendientes ? rows.filter(r => Number(r.pendiente) > 0) : rows).slice(0, args.limite);
    });

    defineTool(server, ctx, 'buscar_movimientos_empresa', {
        title: 'Buscar movimientos de dinero de empresa',
        description: 'Cobros, pagos y traspasos reales en las cuentas de la empresa, con las facturas a las que están vinculados.',
        input: {
            empresa_id: empresa, cuenta_id: id.optional(), desde: fecha.optional(), hasta: fecha.optional(),
            texto: z.string().max(100).optional(), tipo_flujo: z.enum([...FLOW_TYPES, 'TRANSFER']).optional(),
            sin_vincular: z.boolean().default(false).describe('Solo cobros y pagos sin factura vinculada'),
            limite: z.number().int().min(1).max(500).default(100),
        },
        annotations: READ,
    }, async (args, c) => {
        const business = await requireBusiness(c, args.empresa_id);
        const movements = await prisma.businessMovement.findMany({
            where: {
                business_id: business.id, date: dateFilter(args.desde, args.hasta),
                ...(args.cuenta_id ? { account_id: args.cuenta_id } : {}), ...(args.tipo_flujo ? { flow_type: args.tipo_flujo } : {}),
                ...(args.texto ? { description: { contains: args.texto, mode: 'insensitive' } } : {}),
                ...(args.sin_vincular ? { allocations: { none: {} }, flow_type: { not: 'TRANSFER' } } : {}),
            },
            orderBy: [{ date: 'desc' }, { id: 'desc' }], take: args.limite,
            include: { account: { select: { name: true } }, allocations: { include: { activity: { select: { description: true, document_number: true } } } } },
        });
        return movements;
    });

    defineTool(server, ctx, 'ver_configuracion_empresa', {
        title: 'Cuentas, previsiones, presupuestos y categorías de una empresa',
        description: 'Datos de la empresa, cuentas con su saldo actual, previsiones de cobros y pagos, presupuestos y categorías ya usadas. Consúltala antes de registrar operaciones o movimientos.',
        input: { empresa_id: empresa },
        annotations: READ,
    }, async ({ empresa_id }, c) => {
        const business = await requireBusiness(c, empresa_id);
        const where = { business_id: business.id };
        const today = appDate(todayInMadrid());
        const [accounts, plans, budgets, categories] = await Promise.all([
            prisma.businessAccount.findMany({ where, orderBy: { id: 'asc' }, include: { movements: { where: { date: { lte: today } }, select: { amount: true } } } }),
            prisma.businessCashPlan.findMany({ where, orderBy: { due_on: 'asc' } }),
            prisma.businessBudget.findMany({ where, orderBy: [{ period: 'desc' }, { category: 'asc' }] }),
            prisma.businessActivity.groupBy({ by: ['direction', 'category'], where, _count: true }),
        ]);
        return {
            empresa: business,
            cuentas: accounts.map(({ movements, ...account }) => ({
                ...account,
                saldo: money((cents(account.opening_balance, { allowNegative: true, allowZero: true }) || 0) + movements.reduce((s, m) => s + cents(m.amount, { allowNegative: true, allowZero: true }), 0)),
            })),
            previsiones: plans, presupuestos: budgets,
            categorias: categories.map(r => ({ tipo: r.direction, categoria: r.category, usos: r._count })),
        };
    });

    defineTool(server, ctx, 'guardar_operacion_empresa', {
        title: 'Crear o editar una operación de empresa (ingreso o gasto)',
        description: 'Registra un ingreso o gasto por devengo, con o sin factura externa. Sin id crea; con id edita (los campos no indicados se mantienen). Sin factura (document_kind NONE) el IVA debe ser 0. vat_period no puede ser anterior al trimestre de document_date. Editar los datos fiscales (importes, IVA, fechas, número, contraparte o período) de una factura de un trimestre de IVA ya terminado exige confirmarlo con el usuario y repetir con confirmar_trimestre_cerrado: true; concepto, categoría y vencimiento se cambian sin confirmar. Las fechas futuras van como previsión, no como operación. Los cobros y pagos reales se registran aparte con registrar_movimiento_empresa.',
        input: {
            empresa_id: empresa, id: id.optional(), direction: direccion.optional(),
            description: z.string().max(240).optional(), category: z.string().max(100).optional(),
            occurred_on: fecha.optional().describe('Fecha de devengo'), due_on: fecha.nullable().optional().describe('Vencimiento del cobro o pago'),
            counterparty_name: z.string().max(160).nullable().optional(), counterparty_tax_id: z.string().max(32).nullable().optional(),
            document_kind: z.enum(['NONE', 'INVOICE']).optional(), document_number: z.string().max(80).nullable().optional(),
            document_date: fecha.nullable().optional(), vat_period: z.string().regex(/^\d{4}-Q[1-4]$/).nullable().optional(),
            tax_lines: z.array(taxLine).min(1).max(20).optional(), withholding_rate: z.number().min(0).max(100).optional().describe('Retención de IRPF en %'),
            confirmar_trimestre_cerrado: confirmarTrimestre,
        },
        annotations: WRITE,
    }, async ({ empresa_id, id: activityId, confirmar_trimestre_cerrado, ...input }, c) => {
        const business = await requireBusiness(c, empresa_id);
        if (!activityId) {
            const value = activityBody(input);
            const created = await prisma.$transaction(async tx => {
                const activity = await tx.businessActivity.create({ data: { business_id: business.id, ...value } });
                const log = await logChange(tx, c, { entity: 'business_activity', entityId: activity.id, action: 'CREATE', after: activity, businessId: business.id });
                return { accion: 'creada', cambio: log.id, operacion: activity };
            });
            return created;
        }
        return prisma.$transaction(async tx => {
            const existing = await tx.businessActivity.findFirst({ where: { id: activityId, business_id: business.id }, include: { allocations: true } });
            if (!existing) throw new ToolError(`No existe la operación ${activityId}`);
            const value = activityBody(input, existing);
            requireClosedQuarterConfirmation(closedQuartersTouched(existing, value), 'editar', confirmar_trimestre_cerrado);
            if (existing.allocations.length && existing.direction !== value.direction) throw new ToolError('Desvincula los cobros o pagos antes de cambiar el tipo');
            const paid = existing.allocations.reduce((sum, a) => sum + cents(a.amount), 0);
            if (paid > cents(value.total_amount)) throw new ToolError('El nuevo total es inferior al importe ya cobrado o pagado');
            const { allocations: _a, ...before } = existing;
            const updated = await tx.businessActivity.update({ where: { id: activityId }, data: value });
            const log = await logChange(tx, c, { entity: 'business_activity', entityId: activityId, action: 'UPDATE', before, after: updated, businessId: business.id });
            return { accion: 'editada', cambio: log.id, operacion: updated };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });

    defineTool(server, ctx, 'borrar_operacion_empresa', {
        title: 'Borrar una operación de empresa',
        description: 'Borra una operación sin cobros ni pagos vinculados. Sus adjuntos se borran con ella y no se recuperan al deshacer. Si es una factura de un trimestre de IVA ya terminado (puede estar declarado), confírmalo con el usuario y repite con confirmar_trimestre_cerrado: true.',
        input: { empresa_id: empresa, id, confirmar_trimestre_cerrado: confirmarTrimestre },
        annotations: DELETE,
    }, async ({ empresa_id, id: activityId, confirmar_trimestre_cerrado }, c) => {
        const business = await requireBusiness(c, empresa_id);
        try {
            return await prisma.$transaction(async tx => {
                const existing = await tx.businessActivity.findFirst({ where: { id: activityId, business_id: business.id } });
                if (!existing) throw new ToolError(`No existe la operación ${activityId}`);
                if (await tx.businessAllocation.count({ where: { business_id: business.id, activity_id: activityId } })) throw new ToolError('Desvincula sus cobros o pagos antes de borrarla');
                requireClosedQuarterConfirmation(closedQuartersTouched(existing), 'borrar', confirmar_trimestre_cerrado);
                await tx.businessActivity.delete({ where: { id: activityId } });
                const log = await logChange(tx, c, { entity: 'business_activity', entityId: activityId, action: 'DELETE', before: existing, businessId: business.id });
                return { borrada: activityId, cambio: log.id };
            });
        } catch (error) {
            // La base de datos impide borrarla si entre medias se ha vinculado un cobro o pago.
            if (error?.code === 'P2003') throw new ToolError('Desvincula sus cobros o pagos antes de borrarla');
            throw error;
        }
    });

    defineTool(server, ctx, 'registrar_movimiento_empresa', {
        title: 'Registrar un cobro, pago o traspaso de empresa',
        description: 'Dinero real que entra o sale de una cuenta. direction IN = cobro, OUT = pago; importe siempre positivo. Puede vincularse a operaciones (facturas) pendientes con allocations. Para un traspaso entre cuentas usa flow_type TRANSFER con from_account_id y to_account_id.',
        input: {
            empresa_id: empresa, date: fecha, amount: importe, description: z.string().min(1).max(240),
            direction: z.enum(['IN', 'OUT']).optional(), account_id: id.optional(),
            flow_type: z.enum([...FLOW_TYPES, 'TRANSFER']).default('OPERATING'),
            from_account_id: id.optional(), to_account_id: id.optional(),
            allocations: z.array(z.object({ activity_id: id, amount: importe })).max(30).optional(),
        },
        annotations: WRITE,
    }, async ({ empresa_id, ...input }, c) => {
        const business = await requireBusiness(c, empresa_id);
        const body = { ...input, amount: amountText(input.amount), allocations: (input.allocations || []).map(a => ({ ...a, amount: amountText(a.amount) })) };
        // El movimiento y su registro de cambios se guardan juntos: o los dos o ninguno.
        const { result, batchId, logs } = await prisma.$transaction(async tx => {
            let created;
            try {
                created = await insertBusinessMovement(tx, business.id, body);
            } catch (error) {
                if (error instanceof MovementError) throw new ToolError(error.message);
                throw error;
            }
            const batch = created.transfer ? `traspaso-${created.movements[0].transfer_group}` : null;
            const ids = [];
            for (const movement of created.movements) {
                ids.push((await logChange(tx, c, { entity: 'business_movement', entityId: movement.id, action: 'CREATE', after: movement, businessId: business.id, batchId: batch })).id);
            }
            return { result: created, batchId: batch, logs: ids };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { accion: result.transfer ? 'traspaso registrado' : 'movimiento registrado', cambios: logs, lote: batchId, movimientos: result.movements };
    });

    defineTool(server, ctx, 'vincular_movimiento_empresa', {
        title: 'Vincular un cobro o pago con sus facturas',
        description: 'Sustituye los vínculos de un movimiento con operaciones (facturas). Lista vacía = desvincular. El importe vinculado no puede superar el movimiento ni el pendiente de cada factura.',
        input: { empresa_id: empresa, movimiento_id: id, allocations: z.array(z.object({ activity_id: id, amount: importe })).max(30) },
        annotations: WRITE,
    }, async ({ empresa_id, movimiento_id, allocations }, c) => {
        const business = await requireBusiness(c, empresa_id);
        const result = await replaceAllocations(business.id, movimiento_id, allocations.map(a => ({ ...a, amount: amountText(a.amount) })));
        if (result.error) throw new ToolError(result.error);
        const log = await logChange(prisma, c, { entity: 'business_movement_links', entityId: movimiento_id, action: 'UPDATE', before: result.before, after: result.after, businessId: business.id });
        return { cambio: log.id, vinculos: result.after };
    });

    defineTool(server, ctx, 'borrar_movimiento_empresa', {
        title: 'Borrar un movimiento de empresa',
        description: 'Borra un cobro o pago (y sus vínculos con facturas). En un traspaso se borran los dos movimientos. Se puede deshacer.',
        input: { empresa_id: empresa, id },
        annotations: DELETE,
    }, async ({ empresa_id, id: movementId }, c) => {
        const business = await requireBusiness(c, empresa_id);
        return prisma.$transaction(async tx => {
            const movement = await tx.businessMovement.findFirst({ where: { id: movementId, business_id: business.id } });
            if (!movement) throw new ToolError(`No existe el movimiento ${movementId}`);
            const targets = await tx.businessMovement.findMany({
                where: { business_id: business.id, ...(movement.transfer_group ? { transfer_group: movement.transfer_group } : { id: movementId }) },
                include: { allocations: true },
            });
            const batchId = targets.length > 1 ? `borrado-traspaso-${movement.transfer_group}` : null;
            for (const target of targets) {
                await tx.businessMovement.delete({ where: { id: target.id } });
                await logChange(tx, c, { entity: 'business_movement', entityId: target.id, action: 'DELETE', before: target, businessId: business.id, batchId });
            }
            return { borrados: targets.map(t => t.id), lote: batchId };
        });
    });

    defineTool(server, ctx, 'gestionar_cuenta_empresa', {
        title: 'Crear, editar o borrar una cuenta de empresa',
        description: 'Cuentas bancarias (BANK) o de caja (CASH) con su saldo inicial. Con movimientos solo se puede cambiar el nombre, y no se puede borrar.',
        input: {
            empresa_id: empresa, accion: z.enum(['crear', 'editar', 'borrar']), id: id.optional(),
            name: z.string().max(120).optional(), kind: z.enum(['BANK', 'CASH']).optional(),
            opening_balance: importe.optional(), opening_on: fecha.optional(),
        },
        annotations: WRITE,
    }, async ({ empresa_id, accion, id: accountId, ...input }, c) => {
        const business = await requireBusiness(c, empresa_id);
        return prisma.$transaction(async tx => {
            const existing = accountId ? await tx.businessAccount.findFirst({ where: { id: accountId, business_id: business.id } }) : null;
            if (accion !== 'crear' && !existing) throw new ToolError('Indica el id de una cuenta existente');
            const movementCount = existing ? await tx.businessMovement.count({ where: { account_id: existing.id, business_id: business.id } }) : 0;
            if (accion === 'borrar') {
                const refusal = 'La cuenta tiene movimientos. Consérvala para mantener el historial';
                if (movementCount) throw new ToolError(refusal);
                // La base de datos lo impide también si entre medias se registra un movimiento.
                await tx.businessAccount.delete({ where: { id: existing.id } }).catch(error => { throw error?.code === 'P2003' ? new ToolError(refusal) : error; });
                const log = await logChange(tx, c, { entity: 'business_account', entityId: existing.id, action: 'DELETE', before: existing, businessId: business.id });
                return { accion: 'borrada', cambio: log.id };
            }
            const name = cleanText(input.name ?? existing?.name, 120, true);
            const kind = input.kind ?? existing?.kind ?? 'BANK';
            const openingKey = input.opening_on ?? (existing ? dateKey(existing.opening_on) : null);
            const opening_on = appDate(openingKey);
            const balance = cents(input.opening_balance !== undefined ? amountText(input.opening_balance) : (existing ? String(existing.opening_balance) : null), { allowNegative: true, allowZero: true });
            if (!name || !opening_on || openingKey > todayInMadrid() || balance === null) throw new ToolError('Datos de cuenta inválidos: nombre, saldo inicial y fecha inicial no futura');
            const data = { name, kind, opening_on, opening_balance: money(balance) };
            if (accion === 'crear') {
                const created = await tx.businessAccount.create({ data: { business_id: business.id, ...data } });
                const log = await logChange(tx, c, { entity: 'business_account', entityId: created.id, action: 'CREATE', after: created, businessId: business.id });
                return { accion: 'creada', cambio: log.id, cuenta: created };
            }
            if (movementCount && (existing.kind !== kind || existing.opening_on.getTime() !== opening_on.getTime() || cents(existing.opening_balance, { allowNegative: true, allowZero: true }) !== balance)) {
                throw new ToolError('Con movimientos, solo puedes cambiar el nombre. Registra un ajuste de saldo si es necesario');
            }
            const updated = await tx.businessAccount.update({ where: { id: existing.id }, data });
            const log = await logChange(tx, c, { entity: 'business_account', entityId: existing.id, action: 'UPDATE', before: existing, after: updated, businessId: business.id });
            return { accion: 'editada', cambio: log.id, cuenta: updated };
        });
    });

    defineTool(server, ctx, 'gestionar_prevision_empresa', {
        title: 'Crear, cerrar o borrar una previsión de cobro o pago',
        description: 'Compromisos futuros que todavía no son operaciones (p. ej., una cuota o un cobro esperado). Al registrar el movimiento real, márcala como DONE para no contarla dos veces.',
        input: {
            empresa_id: empresa, accion: z.enum(['crear', 'marcar', 'borrar']), id: id.optional(),
            description: z.string().max(240).optional(), category: z.string().max(100).optional(), direction: direccion.optional(),
            due_on: fecha.optional(), amount: importe.optional(), status: z.enum(['PLANNED', 'DONE']).optional(),
        },
        annotations: WRITE,
    }, async ({ empresa_id, accion, id: planId, ...input }, c) => {
        const business = await requireBusiness(c, empresa_id);
        return prisma.$transaction(async tx => {
            if (accion === 'crear') {
                const description = cleanText(input.description, 240, true);
                const category = cleanText(input.category, 100, true);
                const due_on = appDate(input.due_on);
                const amount = cents(input.amount === undefined ? null : amountText(input.amount));
                if (!description || !category || !due_on || !amount || !input.direction) throw new ToolError('Indica description, category, direction, due_on y amount');
                const created = await tx.businessCashPlan.create({ data: { business_id: business.id, description, category, due_on, amount: money(amount), direction: input.direction } });
                const log = await logChange(tx, c, { entity: 'business_cash_plan', entityId: created.id, action: 'CREATE', after: created, businessId: business.id });
                return { accion: 'creada', cambio: log.id, prevision: created };
            }
            const existing = planId ? await tx.businessCashPlan.findFirst({ where: { id: planId, business_id: business.id } }) : null;
            if (!existing) throw new ToolError('Indica el id de una previsión existente');
            if (accion === 'borrar') {
                await tx.businessCashPlan.delete({ where: { id: existing.id } });
                const log = await logChange(tx, c, { entity: 'business_cash_plan', entityId: existing.id, action: 'DELETE', before: existing, businessId: business.id });
                return { accion: 'borrada', cambio: log.id };
            }
            if (!input.status) throw new ToolError('Indica status PLANNED o DONE');
            const updated = await tx.businessCashPlan.update({ where: { id: existing.id }, data: { status: input.status } });
            const log = await logChange(tx, c, { entity: 'business_cash_plan', entityId: existing.id, action: 'UPDATE', before: existing, after: updated, businessId: business.id });
            return { accion: 'actualizada', cambio: log.id, prevision: updated };
        });
    });

    defineTool(server, ctx, 'fijar_presupuesto_empresa', {
        title: 'Fijar presupuestos mensuales de una empresa',
        description: 'Presupuesto de ingresos o gastos por categoría y mes (AAAA-MM). Importe 0 lo elimina.',
        input: {
            empresa_id: empresa,
            presupuestos: z.array(z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), direction: direccion, category: z.string().min(1).max(100), amount: importe })).min(1).max(200),
        },
        annotations: WRITE,
    }, async ({ empresa_id, presupuestos }, c) => {
        const business = await requireBusiness(c, empresa_id);
        return prisma.$transaction(async tx => {
            const batchId = presupuestos.length > 1 ? `presupuestos-empresa-${Date.now()}` : null;
            const results = [];
            for (const item of presupuestos) {
                const amount = cents(amountText(item.amount), { allowZero: true });
                const category = cleanText(item.category, 100, true);
                if (amount === null || !category) throw new ToolError(`Presupuesto inválido para ${item.category}`);
                const key = { business_id_period_direction_category: { business_id: business.id, period: item.period, direction: item.direction, category } };
                const existing = await tx.businessBudget.findUnique({ where: key });
                if (amount === 0) {
                    if (existing) {
                        await tx.businessBudget.delete({ where: { id: existing.id } });
                        await logChange(tx, c, { entity: 'business_budget', entityId: existing.id, action: 'DELETE', before: existing, businessId: business.id, batchId });
                    }
                    results.push({ ...item, resultado: existing ? 'eliminado' : 'no existía' });
                } else if (existing) {
                    const updated = await tx.businessBudget.update({ where: { id: existing.id }, data: { amount: money(amount) } });
                    await logChange(tx, c, { entity: 'business_budget', entityId: existing.id, action: 'UPDATE', before: existing, after: updated, businessId: business.id, batchId });
                    results.push({ ...item, resultado: 'actualizado' });
                } else {
                    const created = await tx.businessBudget.create({ data: { business_id: business.id, period: item.period, direction: item.direction, category, amount: money(amount) } });
                    await logChange(tx, c, { entity: 'business_budget', entityId: created.id, action: 'CREATE', after: created, businessId: business.id, batchId });
                    results.push({ ...item, resultado: 'creado' });
                }
            }
            return { lote: batchId, resultados: results };
        });
    });
}
