import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export async function businessContext(businessId) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return { response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    const id = Number(businessId);
    if (!Number.isSafeInteger(id) || id < 1) return { response: NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 }) };
    const business = await prisma.business.findFirst({ where: { id, owner_user_id: Number(session.user.id) } });
    if (!business) return { response: NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 }) };
    return { business, userId: Number(session.user.id) };
}

export function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Cuerpo JSON de la petición como objeto. Si no es JSON o no es un objeto (null, una lista, un número),
// devuelve {} para que la validación de cada ruta responda 400 en vez de fallar.
export async function jsonBody(request) {
    const body = await request.json().catch(() => null);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

const PRISMA_ERRORS = {
    P2002: [409, 'Ya existe un registro con esos datos'],
    P2003: [409, 'No se puede completar: hay registros vinculados (movimientos, cobros o pagos) o alguno ya no existe'],
    P2025: [404, 'Registro no encontrado'],
    P2034: [409, 'Otro cambio ha modificado los mismos datos. Vuelve a intentarlo.'],
};

// Envuelve un manejador de la API de empresa para que cualquier error salga como JSON en español
// y nunca como una página HTML. Los errores internos de Next.js se dejan pasar.
export function businessRoute(handler) {
    return async (request, context) => {
        try {
            return await handler(request, context);
        } catch (error) {
            unstable_rethrow(error);
            const known = PRISMA_ERRORS[error?.code];
            if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
            console.error('Error en la API de empresa:', error);
            return NextResponse.json({ error: 'Error interno. Vuelve a intentarlo.' }, { status: 500 });
        }
    };
}
