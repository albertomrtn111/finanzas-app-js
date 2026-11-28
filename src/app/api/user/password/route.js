import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import prisma from '@/lib/db';
import { LIMITS, hit, isLimited, minutesText } from '@/lib/rateLimit';

const json = (body, status = 200, headers = {}) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

// Cambia la contraseña (o crea una, si la cuenta entró con Google y no tenía).
// Al guardarla se cierran todas las sesiones, también la actual.
export async function PATCH(request) {
    const auth = await requireUser({ headers: { 'Cache-Control': 'no-store' } });
    if (auth.response) return auth.response;
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Envía los datos en JSON' }, 415);

    const { userId } = auth;
    const { currentPassword, newPassword } = await request.json().catch(() => ({}));
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
        return json({ error: 'La nueva contraseña debe tener entre 8 y 72 caracteres' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password_hash: true } });
    if (!user) return json({ error: 'No autorizado' }, 401);

    if (user.password_hash) {
        const limitKey = `password:${userId}`;
        const blocked = isLimited(limitKey, LIMITS.passwordChange);
        if (blocked.limited) {
            return json({ error: `Demasiados intentos. Vuelve a probar dentro de ${minutesText(blocked.retryAfterMs)}.` }, 429, { 'Retry-After': String(Math.ceil(blocked.retryAfterMs / 1000)) });
        }
        const valid = typeof currentPassword === 'string' && currentPassword.length > 0 && await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
            hit(limitKey, LIMITS.passwordChange);
            return json({ error: 'La contraseña actual no es correcta' }, 400);
        }
        if (await bcrypt.compare(newPassword, user.password_hash)) {
            return json({ error: 'La nueva contraseña tiene que ser distinta de la actual' }, 400);
        }
    }

    await prisma.user.update({
        where: { id: userId },
        data: { password_hash: await bcrypt.hash(newPassword, 12), session_version: { increment: 1 } },
    });
    return json({ ok: true, message: 'Contraseña guardada. Vuelve a iniciar sesión con la nueva.' });
}
