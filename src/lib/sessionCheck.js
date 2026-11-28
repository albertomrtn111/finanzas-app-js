// Parte pura de la comprobación de sesión (src/lib/session.js), sin Next.js, para poder probarla.

// Modos de cuenta sin espacio personal: las rutas personales responden «No autorizado».
export const NO_PERSONAL_SPACE = ['COMPANY', 'UNSET'];

const UNAUTHORIZED = Object.freeze({ status: 401, error: 'No autorizado' });

// Devuelve { userId, accountMode } o { status, error }. deny: modos de cuenta que no pueden entrar.
export function checkSession(session, { deny = [] } = {}) {
    const userId = Number(session?.user?.id);
    if (!session?.user?.id || !Number.isSafeInteger(userId) || userId < 1) return UNAUTHORIZED;
    const accountMode = session.user.accountMode;
    if (deny.includes(accountMode)) return UNAUTHORIZED;
    return { userId, accountMode };
}
