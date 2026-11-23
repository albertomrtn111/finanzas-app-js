// Accesos al MCP de cada usuario, gestionados desde Mi Perfil.
// Todo se filtra por el usuario de la sesión: nadie puede ver ni revocar accesos de otro.
import prisma from '../db.js';
import { displayPrefix, generateToken, hashToken } from './tokens.js';

export const MAX_ACTIVE_TOKENS = 10;

const PUBLIC_FIELDS = { id: true, name: true, token_prefix: true, created_at: true, last_used_at: true, revoked_at: true };

export function mcpUrl(request) {
    const base = process.env.NEXTAUTH_URL || new URL(request.url).origin;
    return `${base.replace(/\/+$/, '')}/api/mcp`;
}

export function listTokens(userId) {
    return prisma.mcpToken.findMany({ where: { user_id: userId }, orderBy: { id: 'desc' }, select: PUBLIC_FIELDS });
}

export function cleanTokenName(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim().replace(/\s+/g, ' ');
    return name.length >= 1 && name.length <= 80 ? name : null;
}

// Devuelve { token, access } con el token en claro (solo esta vez) o { error, status }.
export async function createToken(userId, name) {
    const clean = cleanTokenName(name);
    if (!clean) return { error: 'Pon un nombre de 1 a 80 caracteres (p. ej., «Claude Code portátil»)', status: 400 };
    const active = await prisma.mcpToken.count({ where: { user_id: userId, revoked_at: null } });
    if (active >= MAX_ACTIVE_TOKENS) return { error: `Ya tienes ${MAX_ACTIVE_TOKENS} accesos activos. Revoca alguno antes de crear otro`, status: 409 };
    const token = generateToken();
    const access = await prisma.mcpToken.create({
        data: { user_id: userId, name: clean, token_hash: hashToken(token), token_prefix: displayPrefix(token) },
        select: PUBLIC_FIELDS,
    });
    return { token, access };
}

// Revoca solo si el acceso es del usuario. Devuelve true si se revocó.
export async function revokeToken(userId, tokenId) {
    const result = await prisma.mcpToken.updateMany({ where: { id: tokenId, user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } });
    return result.count > 0;
}
