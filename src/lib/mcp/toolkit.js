import * as z from 'zod';
import prisma from '../db.js';
import { plain } from './serialize.js';

export class ToolError extends Error {}

export const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
export const importe = z.union([z.number(), z.string()]).describe('Importe en euros, con punto decimal y hasta dos decimales');
export const id = z.number().int().positive();

export const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

function friendly(error) {
    if (error instanceof ToolError) return error.message;
    if (error?.code === 'P2002') return 'Ya existe un registro con esos datos (nombre, fecha o número repetido)';
    if (error?.code === 'P2003') return 'No se puede completar: hay registros vinculados (movimientos, cobros o pagos) o alguno ya no existe';
    if (error?.code === 'P2025') return 'No se ha encontrado el registro';
    if (error?.code === 'P2034') return 'Otro cambio ha modificado los mismos datos. Vuelve a intentarlo';
    return null;
}

// Registra una herramienta: añade el nombre al contexto, convierte errores y devuelve JSON legible.
export function defineTool(server, ctx, name, { title, description, input = {}, annotations }, handler) {
    server.registerTool(name, { title, description, inputSchema: input, annotations: { title, ...annotations } }, async args => {
        const toolCtx = { ...ctx, tool: name };
        try {
            const data = await handler(args, toolCtx);
            return { content: [{ type: 'text', text: JSON.stringify(plain(data), null, 2) }] };
        } catch (error) {
            const message = friendly(error);
            if (!message) console.error(`Error en la herramienta MCP ${name}:`, error);
            return { isError: true, content: [{ type: 'text', text: message || 'Error interno al ejecutar la herramienta' }] };
        }
    });
}

export function requirePersonal(ctx) {
    if (!['PERSONAL', 'BOTH'].includes(ctx.user.account_mode)) {
        throw new ToolError('Esta cuenta no tiene espacio personal activado');
    }
}

export async function requireBusiness(ctx, businessId) {
    const business = await prisma.business.findFirst({ where: { id: businessId, owner_user_id: ctx.userId } });
    if (!business) throw new ToolError(`No existe la empresa ${businessId} o no es tuya. Consulta ver_contexto para ver tus empresas`);
    return business;
}

export function utcDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ToolError(`Fecha inválida: ${value}`);
    return date;
}

export function dateFilter(from, to) {
    if (!from && !to) return undefined;
    return { ...(from ? { gte: utcDate(from) } : {}), ...(to ? { lte: utcDate(to) } : {}) };
}

export function todayMadrid() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function amountText(value) {
    return typeof value === 'number' ? String(value) : value?.trim().replace(',', '.');
}
