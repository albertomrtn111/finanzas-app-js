import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import prisma from '../db.js';
import { bearerToken, hashToken } from './tokens.js';
import { registerGeneralTools } from './tools/general.js';
import { registerPersonalTools } from './tools/personal.js';
import { registerBusinessTools } from './tools/business.js';
import { IMPORT_PROMPT, registerImportTools } from './tools/import.js';

const INSTRUCTIONS = `NextFinance: finanzas personales y de empresa de un usuario, con lectura y escritura.
Empieza con ver_contexto: da la fecha de hoy, si hay espacio personal y las empresas con su id.
Lo personal y cada empresa son espacios separados. Para clasificar, consulta antes ver_configuracion_personal o ver_configuracion_empresa y reutiliza los nombres existentes.
Antes de crear, editar o borrar, confirma los datos con el usuario y busca duplicados. Cada cambio, hecho desde la IA o desde la web, queda en historial_cambios y se puede revertir con deshacer_cambio.
Para importar capturas o extractos bancarios: lee tú las filas, llama a preparar_importacion, enseña tu propuesta de clasificación y, cuando el usuario la confirme, llama a importar_movimientos. Una importación se deshace entera con deshacer_cambio y su lote.
Para análisis usa resumen_personal, ver_patrimonio y resumen_empresa. Ofrece datos, escenarios y pros y contras; no des recomendaciones personalizadas de inversión.`;

export function createFinanceServer(user) {
    const server = new McpServer({ name: 'nextfinance', version: '1.0.0' }, { instructions: INSTRUCTIONS });
    const ctx = { user, userId: user.id };
    registerGeneralTools(server, ctx);
    registerPersonalTools(server, ctx);
    registerBusinessTools(server, ctx);
    registerImportTools(server, ctx);
    server.registerPrompt('importar_extracto', {
        title: 'Importar un extracto o captura bancaria',
        description: 'Guía para leer capturas o extractos, clasificarlos contigo y guardarlos en NextFinance',
    }, () => ({ messages: [{ role: 'user', content: { type: 'text', text: IMPORT_PROMPT } }] }));
    return server;
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

// Devuelve el usuario del token o null.
export async function authenticateMcpRequest(request) {
    const token = bearerToken(request);
    if (!token) return null;
    const record = await prisma.mcpToken.findUnique({ where: { token_hash: hashToken(token) }, include: { user: { select: { id: true, name: true, account_mode: true } } } });
    if (!record || record.revoked_at) return null;
    if (!record.last_used_at || Date.now() - record.last_used_at.getTime() > TOUCH_INTERVAL_MS) {
        await prisma.mcpToken.update({ where: { id: record.id }, data: { last_used_at: new Date() } }).catch(() => {});
    }
    return record.user;
}
