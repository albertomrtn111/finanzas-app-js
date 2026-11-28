import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Comprobación de salud para Docker, el despliegue y la monitorización externa.
// No necesita sesión ni da detalles internos: solo si la app y la base de datos responden
// y qué versión está en marcha.
export async function GET() {
    const version = (process.env.APP_COMMIT || 'desconocida').slice(0, 7);
    try {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({ estado: 'ok', base_de_datos: 'ok', version }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ estado: 'error', base_de_datos: 'sin conexión', version }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
