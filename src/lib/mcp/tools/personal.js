import * as z from 'zod';
import prisma from '../../db.js';
import { parseFinancialRecord } from '../../apiValidation.js';
import { netWorth, toMcpSummary } from '../analysis.js';
import { loadPersonalSummary } from '../../personalSummaryData.js';
import { logChange, renameCategory } from '../changeLog.js';
import { dateKey } from '../serialize.js';
import {
    DELETE, READ, ToolError, WRITE, amountText, dateFilter, defineTool, fecha, id, importe, requirePersonal, todayMadrid,
} from '../toolkit.js';

const tipoMovimiento = z.enum(['gasto', 'ingreso']);

function periodFrom({ mes, anio, desde, hasta }) {
    if (mes) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ToolError('El mes debe tener formato AAAA-MM');
        const [y, m] = mes.split('-').map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return { from: `${mes}-01`, to: `${mes}-${String(last).padStart(2, '0')}` };
    }
    if (anio) return { from: `${anio}-01-01`, to: `${anio}-12-31` };
    if (desde || hasta) {
        const today = todayMadrid();
        const from = desde || `${(hasta || today).slice(0, 4)}-01-01`;
        const to = hasta || today;
        if (from > to) throw new ToolError('La fecha inicial es posterior a la final');
        return { from, to };
    }
    const today = todayMadrid();
    return { from: `${today.slice(0, 7)}-01`, to: today };
}

function textFilter(text, fields) {
    if (!text) return {};
    return { OR: fields.map(field => ({ [field]: { contains: text, mode: 'insensitive' } })) };
}

function recordInput(kind, args, existing = {}) {
    const merged = { ...existing, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) };
    for (const key of ['amount', 'current_value', 'contribution']) {
        if (merged[key] !== undefined && merged[key] !== null) merged[key] = amountText(typeof merged[key] === 'object' ? String(merged[key]) : merged[key]);
    }
    if (merged.date instanceof Date) merged.date = dateKey(merged.date);
    const { value, error } = parseFinancialRecord(kind, merged);
    if (error) throw new ToolError(error);
    return value;
}

export function registerPersonalTools(server, ctx) {
    defineTool(server, ctx, 'buscar_movimientos_personales', {
        title: 'Buscar gastos e ingresos personales',
        description: 'Lista gastos y/o ingresos personales con filtros (fechas, categoría, texto en notas/fuente/subcategoría, importes). Devuelve los registros con su id y los totales del filtro. Úsala antes de editar o borrar, y para detectar duplicados antes de importar.',
        input: {
            tipo: z.enum(['gasto', 'ingreso', 'ambos']).default('ambos'),
            desde: fecha.optional(), hasta: fecha.optional(),
            categoria: z.string().max(100).optional(),
            texto: z.string().max(100).optional().describe('Busca en notas, subcategoría, método de pago o fuente'),
            importe_min: z.number().optional(), importe_max: z.number().optional(),
            limite: z.number().int().min(1).max(500).default(100), desplazamiento: z.number().int().min(0).default(0),
        },
        annotations: READ,
    }, async (args, c) => {
        requirePersonal(c);
        const amount = args.importe_min !== undefined || args.importe_max !== undefined
            ? { ...(args.importe_min !== undefined ? { gte: args.importe_min } : {}), ...(args.importe_max !== undefined ? { lte: args.importe_max } : {}) } : undefined;
        const base = { user_id: c.userId, date: dateFilter(args.desde, args.hasta), amount, ...(args.categoria ? { category: args.categoria } : {}) };
        const page = { orderBy: [{ date: 'desc' }, { id: 'desc' }], take: args.limite, skip: args.desplazamiento };
        const result = {};
        if (args.tipo !== 'ingreso') {
            const where = { ...base, ...textFilter(args.texto, ['notes', 'subcategory', 'payment_method', 'expense_type']) };
            const [items, totals] = await Promise.all([prisma.expense.findMany({ where, ...page }), prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true })]);
            result.gastos = { total: totals._sum.amount ?? 0, numero: totals._count, registros: items };
        }
        if (args.tipo !== 'gasto') {
            const where = { ...base, ...textFilter(args.texto, ['notes', 'source']) };
            const [items, totals] = await Promise.all([prisma.income.findMany({ where, ...page }), prisma.income.aggregate({ where, _sum: { amount: true }, _count: true })]);
            result.ingresos = { total: totals._sum.amount ?? 0, numero: totals._count, registros: items };
        }
        return result;
    });

    defineTool(server, ctx, 'resumen_personal', {
        title: 'Resumen financiero personal de un periodo',
        description: 'Ingresos, gastos, ahorro y tasa de ahorro; gasto frente al presupuesto solo en las categorías que lo tienen (desviación en € y %, estado y gasto sin presupuesto aparte); gasto fijo y variable; serie mensual; mayores gastos; y comparación equivalente: un mes frente al anterior, un año frente a las mismas fechas del anterior y, si el periodo está en curso, ambos lados hasta el mismo día. El presupuesto de un año en curso cuenta solo los meses transcurridos. Indica mes (AAAA-MM), año o desde/hasta. Por defecto, el mes en curso.',
        input: { mes: z.string().optional(), anio: z.number().int().min(1900).max(2100).optional(), desde: fecha.optional(), hasta: fecha.optional() },
        annotations: READ,
    }, async (args, c) => {
        requirePersonal(c);
        const { from, to } = periodFrom(args);
        return toMcpSummary(await loadPersonalSummary(c.userId, { from, to, today: todayMadrid() }));
    });

    defineTool(server, ctx, 'ver_patrimonio', {
        title: 'Patrimonio, liquidez e inversiones',
        description: 'Patrimonio a una fecha (por defecto hoy): líquido por cuenta, valor de cada inversión, aportado, plusvalía y rentabilidad, y reparto por tipo de activo. Opcionalmente, la evolución mensual del patrimonio en los últimos N meses.',
        input: { fecha: fecha.optional(), evolucion_meses: z.number().int().min(0).max(120).default(0) },
        annotations: READ,
    }, async (args, c) => {
        requirePersonal(c);
        const through = args.fecha || todayMadrid();
        const [cash, investments] = await Promise.all([
            prisma.cashSnapshot.findMany({ where: { user_id: c.userId } }),
            prisma.investment.findMany({ where: { user_id: c.userId } }),
        ]);
        const result = netWorth({ cash, investments, through });
        if (args.evolucion_meses) {
            const series = [];
            const [y, m] = through.split('-').map(Number);
            for (let i = args.evolucion_meses - 1; i >= 0; i -= 1) {
                const end = new Date(Date.UTC(y, m - i, 0));
                const key = i === 0 ? through : dateKey(end);
                const point = netWorth({ cash, investments, through: key });
                series.push({ fecha: key, patrimonio: point.patrimonio_total, liquido: point.liquido, invertido: point.invertido, aportado: point.aportado });
            }
            result.evolucion = series;
        }
        return result;
    });

    defineTool(server, ctx, 'ver_configuracion_personal', {
        title: 'Categorías, presupuestos y productos personales',
        description: 'Categorías de gasto e ingreso (con número de usos), presupuestos mensuales, productos de inversión, cuentas de efectivo y los métodos de pago, subcategorías y tipos de gasto ya usados. Consúltala antes de clasificar o registrar movimientos para reutilizar los nombres existentes.',
        annotations: READ,
    }, async (_args, c) => {
        requirePersonal(c);
        const where = { user_id: c.userId };
        const [expenseCats, incomeCats, budgets, products, cashAccounts, expUse, incUse, methods, subcats, types] = await Promise.all([
            prisma.expenseCategory.findMany({ where, orderBy: { name: 'asc' } }),
            prisma.incomeCategory.findMany({ where, orderBy: { name: 'asc' } }),
            prisma.budget.findMany({ where, orderBy: { category: 'asc' } }),
            prisma.investmentProduct.findMany({ where, orderBy: { name: 'asc' } }),
            prisma.cashSnapshot.groupBy({ by: ['account'], where, _max: { date: true } }),
            prisma.expense.groupBy({ by: ['category'], where, _count: true }),
            prisma.income.groupBy({ by: ['category'], where, _count: true }),
            prisma.expense.groupBy({ by: ['payment_method'], where, _count: true }),
            prisma.expense.groupBy({ by: ['category', 'subcategory'], where: { ...where, subcategory: { not: null } }, _count: true }),
            prisma.expense.groupBy({ by: ['expense_type'], where, _count: true }),
        ]);
        const count = (rows, key) => new Map(rows.map(r => [r[key], r._count]));
        const expCount = count(expUse, 'category');
        const incCount = count(incUse, 'category');
        return {
            categorias_gasto: expenseCats.map(cat => ({ nombre: cat.name, usos: expCount.get(cat.name) || 0 })),
            categorias_ingreso: incomeCats.map(cat => ({ nombre: cat.name, usos: incCount.get(cat.name) || 0 })),
            subcategorias: subcats.map(r => ({ categoria: r.category, subcategoria: r.subcategory, usos: r._count })).sort((a, b) => b.usos - a.usos),
            metodos_pago: methods.filter(r => r.payment_method).map(r => ({ metodo: r.payment_method, usos: r._count })),
            tipos_gasto: types.filter(r => r.expense_type).map(r => ({ tipo: r.expense_type, usos: r._count })),
            presupuestos_mensuales: budgets.map(b => ({ categoria: b.category, importe_mensual: b.monthly_amount })),
            productos_inversion: products.map(p => ({ id: p.id, nombre: p.name, tipo_activo: p.asset_type })),
            cuentas_efectivo: cashAccounts.map(a => ({ cuenta: a.account, ultimo_dato: a._max.date })),
        };
    });

    defineTool(server, ctx, 'historial_patrimonio', {
        title: 'Registros de efectivo o de inversiones',
        description: 'Lista los registros de saldo de efectivo o de valor de inversión (con id), filtrando por cuenta/producto y fechas.',
        input: { tipo: z.enum(['efectivo', 'inversion']), cuenta: z.string().max(150).optional(), desde: fecha.optional(), hasta: fecha.optional(), limite: z.number().int().min(1).max(500).default(100) },
        annotations: READ,
    }, async (args, c) => {
        requirePersonal(c);
        const where = { user_id: c.userId, date: dateFilter(args.desde, args.hasta), ...(args.cuenta ? { account: args.cuenta } : {}) };
        const query = { where, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: args.limite };
        return args.tipo === 'efectivo' ? prisma.cashSnapshot.findMany(query) : prisma.investment.findMany(query);
    });

    defineTool(server, ctx, 'guardar_movimiento_personal', {
        title: 'Crear o editar un gasto o ingreso personal',
        description: 'Sin id crea el registro; con id edita solo los campos indicados. Si la categoría no existe, se crea. Importes siempre positivos. Antes de crear, confirma con el usuario los datos y que no esté ya registrado.',
        input: {
            tipo: tipoMovimiento, id: id.optional(), date: fecha.optional(), amount: importe.optional(),
            category: z.string().max(100).optional(),
            subcategory: z.string().max(100).nullable().optional().describe('Solo gastos'),
            payment_method: z.string().max(50).nullable().optional().describe('Solo gastos'),
            expense_type: z.string().max(50).nullable().optional().describe('Solo gastos (p. ej., fijo o variable)'),
            source: z.string().max(150).nullable().optional().describe('Solo ingresos: de dónde viene'),
            notes: z.string().max(10000).nullable().optional(),
        },
        annotations: WRITE,
    }, async ({ tipo, id: recordId, ...fields }, c) => {
        requirePersonal(c);
        const kind = tipo === 'gasto' ? 'expense' : 'income';
        const model = prisma[kind];
        const categoryModel = kind === 'expense' ? 'expenseCategory' : 'incomeCategory';
        const existing = recordId ? await model.findFirst({ where: { id: recordId, user_id: c.userId } }) : null;
        if (recordId && !existing) throw new ToolError(`No existe el ${tipo} ${recordId}`);
        const value = recordInput(kind, fields, existing ? { ...existing } : {});
        return prisma.$transaction(async tx => {
            const category = await tx[categoryModel].findUnique({ where: { user_id_name: { user_id: c.userId, name: value.category } } });
            if (!category) {
                const created = await tx[categoryModel].create({ data: { user_id: c.userId, name: value.category, created_at: new Date() } });
                await logChange(tx, c, { entity: kind === 'expense' ? 'expense_category' : 'income_category', entityId: created.id, action: 'CREATE', after: created });
            }
            if (existing) {
                const updated = await tx[kind].update({ where: { id: existing.id }, data: value });
                const log = await logChange(tx, c, { entity: kind, entityId: updated.id, action: 'UPDATE', before: existing, after: updated });
                return { accion: 'editado', cambio: log.id, registro: updated };
            }
            const created = await tx[kind].create({ data: { user_id: c.userId, ...value, created_at: new Date() } });
            const log = await logChange(tx, c, { entity: kind, entityId: created.id, action: 'CREATE', after: created });
            return { accion: 'creado', cambio: log.id, registro: created };
        });
    });

    defineTool(server, ctx, 'borrar_movimientos_personales', {
        title: 'Borrar gastos o ingresos personales',
        description: 'Borra uno o varios gastos o ingresos por id. Queda en el registro de cambios y se puede deshacer. Confirma antes con el usuario.',
        input: { tipo: tipoMovimiento, ids: z.array(id).min(1).max(200) },
        annotations: DELETE,
    }, async ({ tipo, ids }, c) => {
        requirePersonal(c);
        const kind = tipo === 'gasto' ? 'expense' : 'income';
        return prisma.$transaction(async tx => {
            const records = await tx[kind].findMany({ where: { id: { in: ids }, user_id: c.userId } });
            const batchId = records.length > 1 ? `borrado-${Date.now()}` : null;
            for (const record of records) {
                await tx[kind].delete({ where: { id: record.id } });
                await logChange(tx, c, { entity: kind, entityId: record.id, action: 'DELETE', before: record, batchId });
            }
            const found = new Set(records.map(r => r.id));
            return { borrados: records.length, no_encontrados: ids.filter(x => !found.has(x)), lote: batchId };
        });
    });

    defineTool(server, ctx, 'guardar_saldo_efectivo', {
        title: 'Registrar o corregir el saldo de una cuenta de efectivo',
        description: 'Guarda el saldo de una cuenta (banco, efectivo…) en una fecha. Sin id: si ya hay un saldo de esa cuenta en esa fecha, se corrige; si no, se crea. Con id, se edita ese registro.',
        input: { id: id.optional(), date: fecha.optional(), account: z.string().max(150).optional(), current_value: importe.optional(), notes: z.string().max(10000).nullable().optional() },
        annotations: WRITE,
    }, async ({ id: recordId, ...fields }, c) => {
        requirePersonal(c);
        let existing = recordId ? await prisma.cashSnapshot.findFirst({ where: { id: recordId, user_id: c.userId } }) : null;
        if (recordId && !existing) throw new ToolError(`No existe el saldo ${recordId}`);
        const value = recordInput('cash', fields, existing ? { ...existing } : {});
        if (!existing) existing = await prisma.cashSnapshot.findFirst({ where: { user_id: c.userId, account: value.account, date: value.date } });
        return prisma.$transaction(async tx => {
            if (existing) {
                const updated = await tx.cashSnapshot.update({ where: { id: existing.id }, data: value });
                const log = await logChange(tx, c, { entity: 'cash_snapshot', entityId: updated.id, action: 'UPDATE', before: existing, after: updated });
                return { accion: 'corregido', cambio: log.id, registro: updated };
            }
            const created = await tx.cashSnapshot.create({ data: { user_id: c.userId, ...value, created_at: new Date() } });
            const log = await logChange(tx, c, { entity: 'cash_snapshot', entityId: created.id, action: 'CREATE', after: created });
            return { accion: 'creado', cambio: log.id, registro: created };
        });
    });

    defineTool(server, ctx, 'guardar_valor_inversion', {
        title: 'Registrar aportación y valor de una inversión',
        description: 'Crea (sin id) o edita (con id) un registro de inversión. account es el nombre del producto. contribution es lo aportado en ese registro (puede ser 0 si solo actualizas el valor, o negativo si retiras); current_value es el valor total del producto en esa fecha. Si el producto no existe, se crea con el tipo de activo indicado.',
        input: {
            id: id.optional(), date: fecha.optional(), account: z.string().max(150).optional(), asset_type: z.string().max(100).optional(),
            contribution: importe.optional(), current_value: importe.optional(), notes: z.string().max(10000).nullable().optional(),
        },
        annotations: WRITE,
    }, async ({ id: recordId, ...fields }, c) => {
        requirePersonal(c);
        const existing = recordId ? await prisma.investment.findFirst({ where: { id: recordId, user_id: c.userId } }) : null;
        if (recordId && !existing) throw new ToolError(`No existe el registro de inversión ${recordId}`);
        let merged = fields;
        if (!existing && fields.account && !fields.asset_type) {
            const product = await prisma.investmentProduct.findFirst({ where: { user_id: c.userId, name: fields.account } });
            if (product) merged = { ...fields, asset_type: product.asset_type };
        }
        const value = recordInput('investment', merged, existing ? { ...existing } : {});
        return prisma.$transaction(async tx => {
            const product = await tx.investmentProduct.findFirst({ where: { user_id: c.userId, name: value.account } });
            if (!product) {
                const created = await tx.investmentProduct.create({ data: { user_id: c.userId, name: value.account, asset_type: value.asset_type, created_at: new Date() } });
                await logChange(tx, c, { entity: 'investment_product', entityId: created.id, action: 'CREATE', after: created });
            }
            if (existing) {
                const updated = await tx.investment.update({ where: { id: existing.id }, data: value });
                const log = await logChange(tx, c, { entity: 'investment', entityId: updated.id, action: 'UPDATE', before: existing, after: updated });
                return { accion: 'editado', cambio: log.id, registro: updated };
            }
            const created = await tx.investment.create({ data: { user_id: c.userId, ...value, created_at: new Date() } });
            const log = await logChange(tx, c, { entity: 'investment', entityId: created.id, action: 'CREATE', after: created });
            return { accion: 'creado', cambio: log.id, registro: created };
        });
    });

    defineTool(server, ctx, 'borrar_registro_patrimonio', {
        title: 'Borrar un saldo de efectivo o registro de inversión',
        description: 'Borra un registro de efectivo o de inversión por id. Se puede deshacer.',
        input: { tipo: z.enum(['efectivo', 'inversion']), id },
        annotations: DELETE,
    }, async ({ tipo, id: recordId }, c) => {
        requirePersonal(c);
        const kind = tipo === 'efectivo' ? 'cashSnapshot' : 'investment';
        const entity = tipo === 'efectivo' ? 'cash_snapshot' : 'investment';
        return prisma.$transaction(async tx => {
            const record = await tx[kind].findFirst({ where: { id: recordId, user_id: c.userId } });
            if (!record) throw new ToolError(`No existe el registro ${recordId}`);
            await tx[kind].delete({ where: { id: record.id } });
            const log = await logChange(tx, c, { entity, entityId: record.id, action: 'DELETE', before: record });
            return { borrado: record.id, cambio: log.id };
        });
    });

    defineTool(server, ctx, 'gestionar_categoria', {
        title: 'Crear, renombrar o borrar una categoría personal',
        description: 'Renombrar actualiza también los movimientos y presupuestos de esa categoría. Solo se borra una categoría sin uso.',
        input: { accion: z.enum(['crear', 'renombrar', 'borrar']), tipo: tipoMovimiento, nombre: z.string().min(1).max(100), nuevo_nombre: z.string().min(1).max(100).optional() },
        annotations: WRITE,
    }, async ({ accion, tipo, nombre, nuevo_nombre }, c) => {
        requirePersonal(c);
        const model = tipo === 'gasto' ? 'expenseCategory' : 'incomeCategory';
        const entity = tipo === 'gasto' ? 'expense_category' : 'income_category';
        const name = nombre.trim();
        return prisma.$transaction(async tx => {
            const existing = await tx[model].findUnique({ where: { user_id_name: { user_id: c.userId, name } } });
            if (accion === 'crear') {
                if (existing) throw new ToolError(`La categoría «${name}» ya existe`);
                const created = await tx[model].create({ data: { user_id: c.userId, name, created_at: new Date() } });
                const log = await logChange(tx, c, { entity, entityId: created.id, action: 'CREATE', after: created });
                return { accion: 'creada', cambio: log.id, categoria: created };
            }
            if (!existing) throw new ToolError(`No existe la categoría «${name}»`);
            if (accion === 'renombrar') {
                const next = nuevo_nombre?.trim();
                if (!next) throw new ToolError('Indica nuevo_nombre');
                if (await tx[model].findUnique({ where: { user_id_name: { user_id: c.userId, name: next } } })) throw new ToolError(`Ya existe la categoría «${next}»`);
                await renameCategory(tx, c.userId, tipo === 'gasto' ? 'expense' : 'income', name, next);
                const log = await logChange(tx, c, { entity, entityId: existing.id, action: 'RENAME', before: { name }, after: { name: next } });
                return { accion: 'renombrada', cambio: log.id, de: name, a: next };
            }
            const uses = tipo === 'gasto'
                ? await tx.expense.count({ where: { user_id: c.userId, category: name } }) + await tx.budget.count({ where: { user_id: c.userId, category: name } })
                : await tx.income.count({ where: { user_id: c.userId, category: name } });
            if (uses) throw new ToolError(`La categoría «${name}» está en uso (${uses} registros). Renómbrala o reclasifica antes sus movimientos`);
            await tx[model].delete({ where: { id: existing.id } });
            const log = await logChange(tx, c, { entity, entityId: existing.id, action: 'DELETE', before: existing });
            return { accion: 'borrada', cambio: log.id };
        });
    });

    defineTool(server, ctx, 'fijar_presupuestos', {
        title: 'Fijar presupuestos mensuales de gasto',
        description: 'Crea o cambia el presupuesto mensual de una o varias categorías de gasto. Importe 0 elimina el presupuesto de esa categoría. No toca las categorías que no indiques.',
        input: { presupuestos: z.array(z.object({ categoria: z.string().min(1).max(100), importe_mensual: importe })).min(1).max(100) },
        annotations: WRITE,
    }, async ({ presupuestos }, c) => {
        requirePersonal(c);
        const parsed = presupuestos.map(p => {
            const amount = amountText(p.importe_mensual);
            if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) > 9999999999.99) throw new ToolError(`Importe inválido para ${p.categoria}`);
            return { category: p.categoria.trim(), amount };
        });
        if (new Set(parsed.map(p => p.category)).size !== parsed.length) throw new ToolError('Hay categorías repetidas');
        return prisma.$transaction(async tx => {
            const batchId = parsed.length > 1 ? `presupuestos-${Date.now()}` : null;
            const results = [];
            for (const { category, amount } of parsed) {
                const existing = await tx.budget.findUnique({ where: { user_id_category: { user_id: c.userId, category } } });
                if (Number(amount) === 0) {
                    if (existing) {
                        await tx.budget.delete({ where: { id: existing.id } });
                        await logChange(tx, c, { entity: 'budget', entityId: existing.id, action: 'DELETE', before: existing, batchId });
                    }
                    results.push({ categoria: category, resultado: existing ? 'eliminado' : 'no tenía presupuesto' });
                    continue;
                }
                const category_exists = await tx.expenseCategory.findUnique({ where: { user_id_name: { user_id: c.userId, name: category } } });
                if (!category_exists) throw new ToolError(`No existe la categoría de gasto «${category}». Créala antes con gestionar_categoria`);
                if (existing) {
                    const updated = await tx.budget.update({ where: { id: existing.id }, data: { monthly_amount: amount, updated_at: new Date() } });
                    await logChange(tx, c, { entity: 'budget', entityId: updated.id, action: 'UPDATE', before: existing, after: updated, batchId });
                    results.push({ categoria: category, resultado: 'actualizado', importe_mensual: updated.monthly_amount });
                } else {
                    const created = await tx.budget.create({ data: { user_id: c.userId, category, monthly_amount: amount, created_at: new Date(), updated_at: new Date() } });
                    await logChange(tx, c, { entity: 'budget', entityId: created.id, action: 'CREATE', after: created, batchId });
                    results.push({ categoria: category, resultado: 'creado', importe_mensual: created.monthly_amount });
                }
            }
            return { lote: batchId, resultados: results };
        });
    });

    defineTool(server, ctx, 'gestionar_producto_inversion', {
        title: 'Crear, editar o borrar un producto de inversión',
        description: 'Editar el nombre o el tipo de activo actualiza también sus registros de inversión. Solo se borra un producto sin registros.',
        input: { accion: z.enum(['crear', 'editar', 'borrar']), id: id.optional(), nombre: z.string().min(1).max(150).optional(), tipo_activo: z.string().min(1).max(100).optional() },
        annotations: WRITE,
    }, async ({ accion, id: productId, nombre, tipo_activo }, c) => {
        requirePersonal(c);
        return prisma.$transaction(async tx => {
            if (accion === 'crear') {
                if (!nombre || !tipo_activo) throw new ToolError('Indica nombre y tipo_activo');
                const created = await tx.investmentProduct.create({ data: { user_id: c.userId, name: nombre.trim(), asset_type: tipo_activo.trim(), created_at: new Date() } });
                const log = await logChange(tx, c, { entity: 'investment_product', entityId: created.id, action: 'CREATE', after: created });
                return { accion: 'creado', cambio: log.id, producto: created };
            }
            const existing = productId ? await tx.investmentProduct.findFirst({ where: { id: productId, user_id: c.userId } }) : null;
            if (!existing) throw new ToolError('Indica el id de un producto existente (ver_configuracion_personal)');
            if (accion === 'editar') {
                const data = { name: nombre?.trim() || existing.name, asset_type: tipo_activo?.trim() || existing.asset_type };
                const updated = await tx.investmentProduct.update({ where: { id: existing.id }, data });
                const affected = await tx.investment.findMany({ where: { user_id: c.userId, account: existing.name } });
                const batchId = `producto-${existing.id}-${Date.now()}`;
                await logChange(tx, c, { entity: 'investment_product', entityId: updated.id, action: 'UPDATE', before: existing, after: updated, batchId });
                for (const record of affected) {
                    const changed = await tx.investment.update({ where: { id: record.id }, data: { account: updated.name, asset_type: updated.asset_type } });
                    await logChange(tx, c, { entity: 'investment', entityId: record.id, action: 'UPDATE', before: record, after: changed, batchId });
                }
                return { accion: 'editado', lote: batchId, producto: updated, registros_actualizados: affected.length };
            }
            const uses = await tx.investment.count({ where: { user_id: c.userId, account: existing.name } });
            if (uses) throw new ToolError(`El producto tiene ${uses} registros de inversión; bórralos o consérvalo`);
            await tx.investmentProduct.delete({ where: { id: existing.id } });
            const log = await logChange(tx, c, { entity: 'investment_product', entityId: existing.id, action: 'DELETE', before: existing });
            return { accion: 'borrado', cambio: log.id };
        });
    });
}
