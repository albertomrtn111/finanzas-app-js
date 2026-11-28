// Comprobación de sesión común a las rutas de la API de la web.
// Devuelve { userId, accountMode, session } o { response } con la misma respuesta 401 de siempre.
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth.js';
import { NO_PERSONAL_SPACE, checkSession } from './sessionCheck.js';

export { NO_PERSONAL_SPACE, checkSession };

// Usuario de la sesión. headers: cabeceras extra para la respuesta 401 (p. ej., Cache-Control).
export async function requireUser({ deny = [], headers } = {}) {
    const session = await getServerSession(authOptions);
    const result = checkSession(session, { deny });
    if (result.error) return { response: NextResponse.json({ error: result.error }, { status: result.status, ...(headers ? { headers } : {}) }) };
    return { ...result, session };
}

// Usuario de la sesión con espacio personal (cuenta PERSONAL o BOTH).
export function requirePersonalUser(options = {}) {
    return requireUser({ ...options, deny: NO_PERSONAL_SPACE });
}
