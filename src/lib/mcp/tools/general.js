import * as z from 'zod';
import prisma from '../../db.js';
import { ENTITIES, SOURCES, revertChanges } from '../changeLog.js';
import { DELETE, READ, ToolError, defineTool, id, todayMadrid } from '../toolkit.js';

export function registerGeneralTools(server, ctx) {
    defineTool(server, ctx, 'ver_contexto', {
        title: 'Contexto del usuario y sus espacios',
        description: 'Empieza por aquí. Devuelve la fecha de hoy, si hay espacio personal y la lista de empresas (con su id). Lo personal y cada empresa son espacios separados: no mezcles sus movimientos.',
        annotations: READ,
    }, async (_args, c) => {
        const businesses = await prisma.business.findMany({ where: { owner_user_id: c.userId }, orderBy: { id: 'asc' }, select: { id: true, name: true, legal_name: true, kind: true, vat_regime: true } });
        const personal = ['PERSONAL', 'BOTH'].includes(c.user.account_mode);
        const counts = personal ? await Promise.all([
            prisma.expense.count({ where: { user_id: c.userId } }), prisma.income.count({ where: { user_id: c.userId } }),
            prisma.expense.aggregate({ where: { user_id: c.userId }, _min: { date: true }, _max: { date: true } }),
        ]) : null;
        return {
            hoy: todayMadrid(),
            usuario: { nombre: c.user.name, modo: c.user.account_mode },
            espacio_personal: personal ? { activo: true, gastos: counts[0], ingresos: counts[1], primer_gasto: counts[2]._min.date, ultimo_gasto: counts[2]._max.date } : { activo: false },
            empresas: businesses,
            notas: [
                'Importes en euros. Gastos e ingresos personales siempre en positivo.',
                'Antes de escribir, confirma con el usuario los datos y comprueba duplicados con las herramientas de búsqueda.',
                'Cada cambio, hecho desde la IA o desde la web, queda en historial_cambios y se puede revertir con deshacer_cambio.',
                'No eres asesor financiero: ofrece datos, escenarios y pros y contras, no recomendaciones personalizadas de compra o venta.',
            ],
        };
    });

    defineTool(server, ctx, 'historial_cambios', {
        title: 'Historial de cambios hechos desde la IA o la web',
        description: 'Lista los cambios registrados (más recientes primero), tanto los hechos desde la IA (MCP) como desde la web, con su id, lote y origen, para revisarlos o deshacerlos. source es MCP o WEB; origen lo dice en palabras.',
        input: {
            entidad: z.enum(Object.keys(ENTITIES)).optional(), lote: z.string().max(80).optional(),
            fuente: z.enum(Object.keys(SOURCES)).optional().describe('MCP = cambios hechos desde la IA; WEB = hechos desde la web'),
            solo_activos: z.boolean().default(true).describe('Oculta los cambios ya deshechos'),
            limite: z.number().int().min(1).max(200).default(30),
        },
        annotations: READ,
    }, async (args, c) => {
        const entries = await prisma.changeLog.findMany({
            where: {
                user_id: c.userId, ...(args.entidad ? { entity: args.entidad } : {}), ...(args.lote ? { batch_id: args.lote } : {}),
                ...(args.fuente ? { source: args.fuente } : {}), ...(args.solo_activos ? { reverted_at: null } : {}),
            },
            orderBy: { id: 'desc' }, take: args.limite,
        });
        return entries.map(entry => ({ ...entry, origen: SOURCES[entry.source] || entry.source }));
    });

    defineTool(server, ctx, 'deshacer_cambio', {
        title: 'Deshacer cambios hechos desde la IA o la web',
        description: 'Revierte uno o varios cambios (por id) o un lote entero, del más reciente al más antiguo y de una vez, hechos desde la IA o desde la web. Si el registro se ha modificado después, se detiene salvo que indiques forzar. Confirma antes con el usuario.',
        input: { ids: z.array(id).max(200).optional(), lote: z.string().max(80).optional(), forzar: z.boolean().default(false) },
        annotations: DELETE,
    }, async ({ ids, lote, forzar }, c) => {
        if (!lote && !ids?.length) throw new ToolError('Indica ids o lote');
        try {
            return await revertChanges(c, { ids: ids || [], batchId: lote || null, force: forzar });
        } catch (error) {
            if (error?.code) throw error;
            throw new ToolError(error.message);
        }
    });
}
