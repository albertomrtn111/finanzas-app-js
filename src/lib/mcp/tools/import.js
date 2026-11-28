// Importación de extractos bancarios y capturas de pantalla.
// La IA lee la imagen o el fichero y pasa las filas; aquí se detectan duplicados, se sugiere la
// clasificación según el historial y, tras la confirmación del usuario, se guarda todo de una vez.
import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import prisma, { Prisma } from '../../db.js';
import { parseFinancialRecord } from '../../apiValidation.js';
import { cents } from '../../business.js';
import { FLOW_TYPES, MovementError, insertBusinessMovement } from '../../businessMovements.js';
import { logChange } from '../changeLog.js';
import { batchRepeats, buildHistory, conceptTokens, findDuplicates, normalizeConcept, similarity, suggest } from '../importing.js';
import { dateKey } from '../serialize.js';
import { READ, ToolError, WRITE, amountText, defineTool, fecha, id, importe, requireBusiness, utcDate } from '../toolkit.js';

const MAX_ROWS = 300;
const DAY = 24 * 60 * 60 * 1000;

const filaLeida = z.object({
    fecha,
    importe: importe.describe('Tal como aparece en el extracto: negativo si sale dinero, positivo si entra'),
    concepto: z.string().min(1).max(240).describe('Texto del banco, sin resumir'),
    cuenta: z.string().max(120).optional().describe('Cuenta o tarjeta del extracto (p. ej., «BBVA nómina», «Tarjeta empresa»)'),
});

const filaClasificada = z.object({
    destino: z.enum(['gasto', 'ingreso', 'movimiento_empresa']),
    fecha,
    importe: importe.describe('Importe del extracto. En lo personal se guarda en positivo; en empresa, el signo da el sentido si no indicas direction'),
    concepto: z.string().min(1).max(240).describe('Texto original del banco'),
    cuenta: z.string().max(120).optional(),
    category: z.string().max(100).optional().describe('Gasto o ingreso personal'),
    subcategory: z.string().max(100).nullable().optional(),
    payment_method: z.string().max(50).nullable().optional(),
    expense_type: z.string().max(50).nullable().optional(),
    source: z.string().max(150).nullable().optional().describe('Ingreso personal: de dónde viene'),
    notes: z.string().max(10000).nullable().optional().describe('Personal. Si no se indica, se guarda el concepto'),
    empresa_id: id.optional(),
    account_id: id.optional().describe('Cuenta de la empresa'),
    direction: z.enum(['IN', 'OUT']).optional(),
    flow_type: z.enum([...FLOW_TYPES, 'TRANSFER']).optional(),
    from_account_id: id.optional(), to_account_id: id.optional(),
    description: z.string().max(240).optional().describe('Empresa. Si no se indica, se guarda el concepto'),
    allocations: z.array(z.object({ activity_id: id, amount: importe })).max(30).optional().describe('Facturas que salda este cobro o pago'),
    forzar_duplicado: z.boolean().optional().describe('Importar aunque parezca ya registrado'),
});

function signedCents(value, row) {
    const result = cents(amountText(value), { allowNegative: true });
    if (result === null) throw new ToolError(`Fila ${row}: importe inválido (${value})`);
    return result;
}

function shiftDate(key, days) {
    return dateKey(new Date(utcDate(key).getTime() + days * DAY));
}

function rangeOf(rows) {
    const dates = rows.map(r => r.fecha).sort();
    return { gte: utcDate(shiftDate(dates[0], -3)), lte: utcDate(shiftDate(dates.at(-1), 3)) };
}

function hasPersonal(ctx) {
    return ['PERSONAL', 'BOTH'].includes(ctx.user.account_mode);
}

// Registros ya guardados con los que comparar: { fecha, centimos (con signo), concepto, ref }.
async function loadExisting(ctx, { personal, businessIds }, date) {
    const tasks = [];
    if (personal) {
        tasks.push(prisma.expense.findMany({ where: { user_id: ctx.userId, date } }).then(rows => rows.map(r => ({
            fecha: dateKey(r.date), centimos: -cents(String(r.amount)), concepto: r.notes || r.subcategory || r.category,
            ref: { espacio: 'personal', tipo: 'gasto', id: r.id, categoria: r.category },
        }))));
        tasks.push(prisma.income.findMany({ where: { user_id: ctx.userId, date } }).then(rows => rows.map(r => ({
            fecha: dateKey(r.date), centimos: cents(String(r.amount)), concepto: [r.source, r.notes].filter(Boolean).join(' ') || r.category,
            ref: { espacio: 'personal', tipo: 'ingreso', id: r.id, categoria: r.category },
        }))));
    }
    if (businessIds.length) {
        tasks.push(prisma.businessMovement.findMany({ where: { business_id: { in: businessIds }, date } }).then(rows => rows.map(r => ({
            fecha: dateKey(r.date), centimos: cents(String(r.amount), { allowNegative: true }), concepto: r.description,
            ref: { espacio: 'empresa', tipo: 'movimiento_empresa', empresa_id: r.business_id, id: r.id, cuenta_id: r.account_id },
        }))));
    }
    return (await Promise.all(tasks)).flat();
}

// Importaciones que siguen vigentes (con algún cambio sin deshacer).
async function activeImports(userId, take = 60) {
    const batches = await prisma.importBatch.findMany({ where: { user_id: userId }, orderBy: { id: 'desc' }, take });
    if (!batches.length) return [];
    const alive = await prisma.changeLog.groupBy({ by: ['batch_id'], where: { user_id: userId, batch_id: { in: batches.map(b => b.batch_id) }, reverted_at: null }, _count: true });
    const aliveSet = new Set(alive.map(a => a.batch_id));
    return batches.filter(b => aliveSet.has(b.batch_id));
}

function classificationOf(row) {
    if (row.destino === 'gasto') return { destino: 'gasto', category: row.category, subcategory: row.subcategory ?? null, payment_method: row.payment_method ?? null, expense_type: row.expense_type ?? null };
    if (row.destino === 'ingreso') return { destino: 'ingreso', category: row.category, source: row.source ?? null };
    return { destino: 'movimiento_empresa', empresa_id: row.empresa_id, account_id: row.account_id ?? null, flow_type: row.flow_type || 'OPERATING' };
}

// Ejemplos para aprender: importaciones confirmadas (pesan más) y lo ya registrado.
async function loadHistory(ctx, { personal, businessIds }) {
    const examples = [];
    const accounts = new Map();
    for (const batch of await activeImports(ctx.userId)) {
        for (const row of Array.isArray(batch.rows) ? batch.rows : []) {
            if (row.resultado !== 'importada' || !row.clasificacion) continue;
            const sentido = row.importe < 0 ? 'salida' : 'entrada';
            if (row.clasificacion.destino === 'movimiento_empresa' && row.clasificacion.flow_type === 'TRANSFER') continue;
            examples.push({ concepto: row.concepto, clasificacion: { sentido, ...row.clasificacion }, peso: 3 });
            if (row.cuenta) {
                const key = normalizeConcept(row.cuenta);
                const bucket = accounts.get(key) || new Map();
                const target = row.clasificacion.destino === 'movimiento_empresa'
                    ? { espacio: 'empresa', empresa_id: row.clasificacion.empresa_id, account_id: row.clasificacion.account_id }
                    : { espacio: 'personal', payment_method: row.clasificacion.payment_method ?? null };
                const idKey = JSON.stringify(target);
                const entry = bucket.get(idKey) || { ...target, veces: 0 };
                entry.veces += 1;
                bucket.set(idKey, entry);
                accounts.set(key, bucket);
            }
        }
    }
    const since = new Date(Date.now() - 3 * 365 * DAY);
    if (personal) {
        const [expenses, incomes] = await Promise.all([
            prisma.expense.findMany({ where: { user_id: ctx.userId, date: { gte: since }, notes: { not: null } }, orderBy: { date: 'desc' }, take: 3000 }),
            prisma.income.findMany({ where: { user_id: ctx.userId, date: { gte: since } }, orderBy: { date: 'desc' }, take: 1000 }),
        ]);
        for (const r of expenses) examples.push({ concepto: r.notes, clasificacion: { sentido: 'salida', destino: 'gasto', category: r.category, subcategory: r.subcategory, payment_method: r.payment_method, expense_type: r.expense_type } });
        for (const r of incomes) {
            const concepto = [r.source, r.notes].filter(Boolean).join(' ');
            if (concepto) examples.push({ concepto, clasificacion: { sentido: 'entrada', destino: 'ingreso', category: r.category, source: r.source } });
        }
    }
    if (businessIds.length) {
        const movements = await prisma.businessMovement.findMany({ where: { business_id: { in: businessIds }, date: { gte: since }, flow_type: { not: 'TRANSFER' } }, orderBy: { date: 'desc' }, take: 3000 });
        for (const r of movements) {
            examples.push({ concepto: r.description, clasificacion: { sentido: Number(r.amount) < 0 ? 'salida' : 'entrada', destino: 'movimiento_empresa', empresa_id: r.business_id, account_id: r.account_id, flow_type: r.flow_type } });
        }
    }
    return { history: buildHistory(examples), accounts };
}

function accountHint(accounts, cuenta) {
    if (!cuenta) return null;
    const bucket = accounts.get(normalizeConcept(cuenta));
    if (!bucket) return null;
    const options = [...bucket.values()].sort((a, b) => b.veces - a.veces);
    return options[0];
}

async function pendingInvoices(businessIds) {
    if (!businessIds.length) return [];
    const activities = await prisma.businessActivity.findMany({ where: { business_id: { in: businessIds } }, include: { allocations: true } });
    return activities.map(a => {
        const pending = cents(String(a.total_amount)) - a.allocations.reduce((sum, x) => sum + cents(String(x.amount)), 0);
        return { empresa_id: a.business_id, id: a.id, direction: a.direction, pendiente: pending, descripcion: a.description, contraparte: a.counterparty_name, numero: a.document_number, vence: a.due_on ? dateKey(a.due_on) : null };
    }).filter(a => a.pendiente > 0);
}

function invoiceCandidates(invoices, row) {
    const direction = row.centimos > 0 ? 'INCOME' : 'EXPENSE';
    const amount = Math.abs(row.centimos);
    return invoices
        .filter(inv => inv.direction === direction)
        .map(inv => {
            const text = [inv.contraparte, inv.numero, inv.descripcion].filter(Boolean).join(' ');
            const parecido = conceptTokens(text).length ? similarity(row.concepto, text) : 0;
            return { inv, exacto: inv.pendiente === amount, parecido };
        })
        .filter(c => c.exacto || (c.parecido >= 0.5 && c.inv.pendiente >= amount))
        .sort((a, b) => Number(b.exacto) - Number(a.exacto) || b.parecido - a.parecido)
        .slice(0, 3)
        .map(({ inv, exacto }) => ({ empresa_id: inv.empresa_id, activity_id: inv.id, numero: inv.numero, contraparte: inv.contraparte, descripcion: inv.descripcion, pendiente: inv.pendiente / 100, vence: inv.vence, importe_exacto: exacto }));
}

async function businessesFor(ctx, ids) {
    const where = { owner_user_id: ctx.userId, ...(ids?.length ? { id: { in: ids } } : {}) };
    const businesses = await prisma.business.findMany({ where, orderBy: { id: 'asc' }, include: { accounts: { orderBy: { id: 'asc' } } } });
    if (ids?.length && businesses.length !== new Set(ids).size) throw new ToolError('Alguna de las empresas indicadas no existe o no es tuya');
    return businesses;
}

export function registerImportTools(server, ctx) {
    defineTool(server, ctx, 'preparar_importacion', {
        title: 'Preparar la importación de un extracto o captura',
        description: [
            'Primer paso para importar movimientos bancarios. Lee tú la captura, el PDF o el fichero y pasa cada fila tal cual (fecha, importe con su signo, concepto del banco y, si se ve, la cuenta o tarjeta).',
            'No guarda nada. Devuelve, por fila: posibles duplicados ya registrados («seguro» o «posible»), filas repetidas dentro del lote, la clasificación sugerida según el historial (con su confianza), facturas de empresa pendientes que podría saldar, y las categorías y cuentas disponibles.',
            'Después enseña al usuario una tabla con tu propuesta (personal o empresa, categoría, método de pago…) y, cuando la confirme, llama a importar_movimientos.',
        ].join(' '),
        input: {
            filas: z.array(filaLeida).min(1).max(MAX_ROWS),
            empresa_ids: z.array(id).max(20).optional().describe('Empresas en las que buscar duplicados y sugerencias. Por defecto, todas'),
        },
        annotations: READ,
    }, async ({ filas, empresa_ids }, c) => {
        const personal = hasPersonal(c);
        const businesses = await businessesFor(c, empresa_ids);
        const businessIds = businesses.map(b => b.id);
        const rows = filas.map((f, index) => ({ ...f, fila: index + 1, centimos: signedCents(f.importe, index + 1) }));
        if (rows.some(r => r.centimos === 0)) throw new ToolError(`Fila ${rows.find(r => r.centimos === 0).fila}: el importe no puede ser 0`);
        for (const r of rows) utcDate(r.fecha);

        const scope = { personal, businessIds };
        const [existing, { history, accounts }, invoices] = await Promise.all([
            loadExisting(c, scope, rangeOf(rows)), loadHistory(c, scope), pendingInvoices(businessIds),
        ]);
        const repeats = batchRepeats(rows);
        const [expenseCats, incomeCats, methods] = personal ? await Promise.all([
            prisma.expenseCategory.findMany({ where: { user_id: c.userId }, orderBy: { name: 'asc' } }),
            prisma.incomeCategory.findMany({ where: { user_id: c.userId }, orderBy: { name: 'asc' } }),
            prisma.expense.groupBy({ by: ['payment_method'], where: { user_id: c.userId, payment_method: { not: null } }, _count: true }),
        ]) : [[], [], []];

        const result = rows.map((row, index) => {
            const sentido = row.centimos < 0 ? 'salida' : 'entrada';
            const duplicados = findDuplicates(row, existing);
            return {
                fila: row.fila, fecha: row.fecha, importe: row.centimos / 100, concepto: row.concepto, cuenta: row.cuenta ?? null, sentido,
                duplicados,
                repetida_en_lote: repeats[index] === null ? null : repeats[index] + 1,
                sugerencia: suggest(history, row.concepto, sentido),
                cuenta_habitual: accountHint(accounts, row.cuenta),
                facturas_candidatas: invoiceCandidates(invoices, row),
            };
        });
        return {
            resumen: {
                filas: result.length,
                salidas: result.filter(r => r.sentido === 'salida').reduce((s, r) => s + r.importe, 0),
                entradas: result.filter(r => r.sentido === 'entrada').reduce((s, r) => s + r.importe, 0),
                con_duplicado_seguro: result.filter(r => r.duplicados.some(d => d.nivel === 'seguro')).map(r => r.fila),
                con_duplicado_posible: result.filter(r => r.duplicados.length && !r.duplicados.some(d => d.nivel === 'seguro')).map(r => r.fila),
                repetidas_en_lote: result.filter(r => r.repetida_en_lote).map(r => r.fila),
                sin_sugerencia: result.filter(r => !r.sugerencia).map(r => r.fila),
            },
            filas: result,
            opciones: {
                espacio_personal: personal,
                categorias_gasto: expenseCats.map(x => x.name),
                categorias_ingreso: incomeCats.map(x => x.name),
                metodos_pago: methods.sort((a, b) => b._count - a._count).map(m => m.payment_method),
                empresas: businesses.map(b => ({ id: b.id, nombre: b.name, cuentas: b.accounts.map(a => ({ id: a.id, nombre: a.name, tipo: a.kind })) })),
            },
            siguiente_paso: 'Propón al usuario la clasificación de cada fila (y qué hacer con duplicados y repetidas). Con su visto bueno, llama a importar_movimientos con las filas confirmadas.',
        };
    });

    defineTool(server, ctx, 'importar_movimientos', {
        title: 'Importar movimientos ya clasificados',
        description: [
            'Guarda de una vez las filas que el usuario ha confirmado, cada una en su destino: gasto o ingreso personal, o cobro/pago/traspaso de una empresa.',
            'Todo o nada: si una fila es inválida, no se guarda ninguna y se indica cuál falla.',
            'Las filas que ya están registradas (duplicado «seguro») o repetidas en el lote se omiten salvo forzar_duplicado o permitir_duplicados.',
            'Las categorías personales que no existan se crean. Devuelve el lote: con deshacer_cambio y ese lote se deshace la importación entera.',
        ].join(' '),
        input: {
            nombre: z.string().min(1).max(160).describe('Para reconocerla luego, p. ej. «BBVA noviembre 2026»'),
            origen: z.enum(['CAPTURA', 'EXTRACTO', 'OTRO']).default('CAPTURA'),
            filas: z.array(filaClasificada).min(1).max(MAX_ROWS),
            permitir_duplicados: z.boolean().default(false),
        },
        annotations: WRITE,
    }, async ({ nombre, origen, filas, permitir_duplicados }, c) => {
        const rows = filas.map((f, index) => ({ ...f, fila: index + 1, centimos: signedCents(f.importe, index + 1) }));
        const personalRows = rows.filter(r => r.destino !== 'movimiento_empresa');
        if (personalRows.length && !hasPersonal(c)) throw new ToolError('Esta cuenta no tiene espacio personal activado');
        const businessIds = [...new Set(rows.filter(r => r.destino === 'movimiento_empresa').map(r => r.empresa_id))];
        if (businessIds.includes(undefined)) throw new ToolError(`Fila ${rows.find(r => r.destino === 'movimiento_empresa' && !r.empresa_id).fila}: falta empresa_id`);
        for (const businessId of businessIds) await requireBusiness(c, businessId);

        // Validación completa antes de escribir nada.
        const errors = [];
        for (const row of rows) {
            if (row.centimos === 0) { errors.push(`Fila ${row.fila}: el importe no puede ser 0`); continue; }
            const amount = (Math.abs(row.centimos) / 100).toFixed(2);
            if (row.destino === 'movimiento_empresa') {
                const transfer = row.flow_type === 'TRANSFER';
                if (!transfer && !row.account_id) errors.push(`Fila ${row.fila}: falta account_id (cuenta de la empresa)`);
                if (transfer && (!row.from_account_id || !row.to_account_id)) errors.push(`Fila ${row.fila}: un traspaso necesita from_account_id y to_account_id`);
                row.body = {
                    date: row.fecha, amount, description: row.description || row.concepto,
                    direction: row.direction || (row.centimos < 0 ? 'OUT' : 'IN'),
                    account_id: row.account_id, flow_type: row.flow_type || 'OPERATING',
                    from_account_id: row.from_account_id, to_account_id: row.to_account_id,
                    allocations: (row.allocations || []).map(a => ({ ...a, amount: amountText(a.amount) })),
                };
                if (transfer) row.centimos = -Math.abs(row.centimos);
                else row.centimos = row.body.direction === 'OUT' ? -Math.abs(row.centimos) : Math.abs(row.centimos);
                continue;
            }
            const kind = row.destino === 'gasto' ? 'expense' : 'income';
            const input = kind === 'expense'
                ? { date: row.fecha, amount, category: row.category, subcategory: row.subcategory, payment_method: row.payment_method, expense_type: row.expense_type, notes: row.notes === undefined ? row.concepto : row.notes }
                : { date: row.fecha, amount, category: row.category, source: row.source, notes: row.notes === undefined ? row.concepto : row.notes };
            const { value, error } = parseFinancialRecord(kind, input);
            if (error) errors.push(`Fila ${row.fila}: ${error}`);
            row.kind = kind;
            row.value = value;
            row.centimos = kind === 'expense' ? -Math.abs(row.centimos) : Math.abs(row.centimos);
        }
        if (errors.length) throw new ToolError(`No se ha importado nada. Corrige estas filas:\n${errors.join('\n')}`);

        // Duplicados: contra lo ya guardado en el mismo espacio y dentro del propio lote.
        const existing = await loadExisting(c, { personal: personalRows.length > 0, businessIds }, rangeOf(rows));
        const repeats = batchRepeats(rows);
        const skipped = [];
        const toImport = [];
        rows.forEach((row, index) => {
            if (permitir_duplicados || row.forzar_duplicado) { toImport.push(row); return; }
            if (repeats[index] !== null) { skipped.push({ fila: row.fila, motivo: `repetida (igual que la fila ${repeats[index] + 1})` }); return; }
            const sameSpace = existing.filter(e => (row.destino === 'movimiento_empresa' ? e.ref.empresa_id === row.empresa_id : e.ref.espacio === 'personal'));
            const duplicate = findDuplicates(row, sameSpace).find(d => d.nivel === 'seguro');
            if (duplicate) { skipped.push({ fila: row.fila, motivo: 'ya registrada', duplicado: duplicate }); return; }
            toImport.push(row);
        });

        const batchId = `importacion-${randomUUID()}`;
        const needsSerializable = toImport.some(r => r.body?.allocations?.length);
        const created = toImport.length ? await prisma.$transaction(async tx => {
            const done = [];
            const knownCategories = new Set();
            for (const row of toImport) {
                if (row.kind) {
                    const categoryModel = row.kind === 'expense' ? 'expenseCategory' : 'incomeCategory';
                    const catKey = `${row.kind}|${row.value.category}`;
                    if (!knownCategories.has(catKey)) {
                        const category = await tx[categoryModel].findUnique({ where: { user_id_name: { user_id: c.userId, name: row.value.category } } });
                        if (!category) {
                            const cat = await tx[categoryModel].create({ data: { user_id: c.userId, name: row.value.category, created_at: new Date() } });
                            await logChange(tx, c, { entity: row.kind === 'expense' ? 'expense_category' : 'income_category', entityId: cat.id, action: 'CREATE', after: cat, batchId });
                        }
                        knownCategories.add(catKey);
                    }
                    const record = await tx[row.kind].create({ data: { user_id: c.userId, ...row.value, created_at: new Date() } });
                    await logChange(tx, c, { entity: row.kind, entityId: record.id, action: 'CREATE', after: record, batchId });
                    done.push({ fila: row.fila, destino: row.destino, ids: [record.id] });
                    continue;
                }
                let result;
                try {
                    result = await insertBusinessMovement(tx, row.empresa_id, row.body);
                } catch (error) {
                    if (error instanceof MovementError) throw new ToolError(`No se ha importado nada. Fila ${row.fila}: ${error.message}`);
                    throw error;
                }
                for (const movement of result.movements) {
                    await logChange(tx, c, { entity: 'business_movement', entityId: movement.id, action: 'CREATE', after: movement, businessId: row.empresa_id, batchId });
                }
                done.push({ fila: row.fila, destino: row.destino, empresa_id: row.empresa_id, ids: result.movements.map(m => m.id) });
            }
            const byRow = new Map(done.map(d => [d.fila, d]));
            const skippedRows = new Map(skipped.map(s => [s.fila, s]));
            await tx.importBatch.create({
                data: {
                    user_id: c.userId, batch_id: batchId, name: nombre, source: origen,
                    rows_total: rows.length, rows_imported: done.length, rows_skipped: skipped.length,
                    rows: rows.map(row => ({
                        fila: row.fila, fecha: row.fecha, importe: row.centimos / 100, concepto: row.concepto, cuenta: row.cuenta ?? null,
                        destino: row.destino, clasificacion: classificationOf(row),
                        resultado: byRow.has(row.fila) ? 'importada' : 'omitida',
                        ids: byRow.get(row.fila)?.ids ?? [], motivo: skippedRows.get(row.fila)?.motivo ?? null,
                    })),
                },
            });
            return done;
        }, { timeout: 120000, maxWait: 10000, ...(needsSerializable ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : {}) }) : [];

        return {
            lote: created.length ? batchId : null,
            importadas: created.length,
            omitidas: skipped,
            registros: created,
            como_deshacer: created.length ? `deshacer_cambio con lote «${batchId}» deshace toda la importación` : 'No se ha guardado nada',
        };
    });

    defineTool(server, ctx, 'ver_importaciones', {
        title: 'Importaciones hechas',
        description: 'Lista las importaciones de extractos y capturas, con su lote, cuántas filas se importaron u omitieron y si se han deshecho. Con incluir_filas, el detalle de cada fila y su clasificación.',
        input: { limite: z.number().int().min(1).max(100).default(20), lote: z.string().max(80).optional(), incluir_filas: z.boolean().default(false) },
        annotations: READ,
    }, async ({ limite, lote, incluir_filas }, c) => {
        const batches = await prisma.importBatch.findMany({ where: { user_id: c.userId, ...(lote ? { batch_id: lote } : {}) }, orderBy: { id: 'desc' }, take: limite });
        if (!batches.length) return [];
        const logs = await prisma.changeLog.groupBy({ by: ['batch_id'], where: { user_id: c.userId, batch_id: { in: batches.map(b => b.batch_id) } }, _count: { _all: true, reverted_at: true } });
        const status = new Map(logs.map(l => [l.batch_id, l]));
        return batches.map(b => {
            const s = status.get(b.batch_id);
            const reverted = s?._count.reverted_at ?? 0;
            const total = s?._count._all ?? 0;
            return {
                lote: b.batch_id, nombre: b.name, origen: b.source, fecha: b.created_at,
                filas: b.rows_total, importadas: b.rows_imported, omitidas: b.rows_skipped,
                estado: reverted === 0 ? 'vigente' : reverted === total ? 'deshecha' : 'deshecha en parte',
                ...(incluir_filas ? { detalle: b.rows } : {}),
            };
        });
    });
}

export const IMPORT_PROMPT = `Quiero importar movimientos bancarios a NextFinance a partir de capturas o extractos que te paso.

1. Llama a ver_contexto si no lo has hecho.
2. Lee todas las filas de las imágenes o ficheros: fecha (AAAA-MM-DD), importe con su signo (negativo si sale dinero), concepto exacto del banco y la cuenta o tarjeta si aparece. No inventes filas ni redondees importes; si algo no se lee bien, dímelo.
3. Llama a preparar_importacion con esas filas.
4. Enséñame una tabla con: fila, fecha, concepto, importe, destino propuesto (personal o empresa y cuenta), categoría, método de pago y avisos (duplicado, repetida, factura que salda). Usa la sugerencia del historial cuando tenga buena confianza y reutiliza las categorías existentes.
5. Espera a que confirme o corrija. Luego llama a importar_movimientos solo con las filas aprobadas, con un nombre reconocible para el lote.
6. Dime cuántas se han importado, cuáles se han omitido y el lote para deshacerla si hace falta.`;
