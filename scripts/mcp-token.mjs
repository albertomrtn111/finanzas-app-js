#!/usr/bin/env node
// Gestiona los accesos al MCP de NextFinance desde el servidor.
//   node scripts/mcp-token.mjs crear <email> [nombre]
//   node scripts/mcp-token.mjs listar <email>
//   node scripts/mcp-token.mjs revocar <id>
import { createPrismaClient } from '../src/lib/db.js';
import { displayPrefix, generateToken, hashToken } from '../src/lib/mcp/tokens.js';

// Prisma 7 ya no lee .env por su cuenta: se carga aquí si existe, sin pisar DATABASE_URL si ya está.
try {
    process.loadEnvFile();
} catch (error) {
    if (error?.code !== 'ENOENT') throw error;
}

const prisma = createPrismaClient();
const [command, arg, ...rest] = process.argv.slice(2);

async function findUser(email) {
    const user = await prisma.user.findUnique({ where: { email: String(email || '').toLowerCase().trim() } });
    if (!user) throw new Error(`No hay ningún usuario con el correo ${email}`);
    return user;
}

async function main() {
    if (command === 'crear') {
        const user = await findUser(arg);
        const token = generateToken();
        const record = await prisma.mcpToken.create({ data: { user_id: user.id, name: rest.join(' ') || 'Claude', token_hash: hashToken(token), token_prefix: displayPrefix(token) } });
        console.log(`Acceso ${record.id} creado para ${user.email} (${record.name}).`);
        console.log('Guárdalo ahora: no se vuelve a mostrar.\n');
        console.log(token);
        return;
    }
    if (command === 'listar') {
        const user = await findUser(arg);
        const tokens = await prisma.mcpToken.findMany({ where: { user_id: user.id }, orderBy: { id: 'asc' } });
        for (const t of tokens) {
            console.log(`${t.id}\t${t.token_prefix}…\t${t.name}\tcreado ${t.created_at.toISOString().slice(0, 10)}\túltimo uso ${t.last_used_at?.toISOString().slice(0, 16) ?? 'nunca'}\t${t.revoked_at ? 'REVOCADO' : 'activo'}`);
        }
        if (!tokens.length) console.log('Sin accesos.');
        return;
    }
    if (command === 'revocar') {
        const updated = await prisma.mcpToken.updateMany({ where: { id: Number(arg), revoked_at: null }, data: { revoked_at: new Date() } });
        console.log(updated.count ? `Acceso ${arg} revocado.` : `No hay un acceso activo con id ${arg}.`);
        return;
    }
    console.log('Uso: node scripts/mcp-token.mjs crear <email> [nombre] | listar <email> | revocar <id>');
    process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
