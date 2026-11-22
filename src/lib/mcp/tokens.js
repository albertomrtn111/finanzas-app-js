import { createHash, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = 'nf_';

export function generateToken() {
    return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function displayPrefix(token) {
    return token.slice(0, 10);
}

export function bearerToken(request) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match || !match[1].startsWith(TOKEN_PREFIX) || match[1].length > 200) return null;
    return match[1];
}
