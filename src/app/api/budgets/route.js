import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Obtener presupuestos
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const budgets = await prisma.budget.findMany({
            where: { user_id: userId },
            orderBy: { category: 'asc' },
        });

        return NextResponse.json(budgets);
    } catch (error) {
        console.error('Error obteniendo presupuestos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Guardar todos los presupuestos (upsert masivo)
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { budgets } = await request.json();

        // Eliminar presupuestos existentes y crear nuevos
        await prisma.budget.deleteMany({
            where: { user_id: userId },
        });

        const now = new Date();
        const newBudgets = await prisma.budget.createMany({
            data: budgets.map((b) => ({
                user_id: userId,
                category: b.category,
                monthly_amount: parseFloat(b.monthly_amount) || 0,
                created_at: now,
                updated_at: now,
            })),
        });

        return NextResponse.json({ message: 'Presupuestos guardados', count: newBudgets.count });
    } catch (error) {
        console.error('Error guardando presupuestos:', error);
        return NextResponse.json({ error: 'Error al guardar' }, { status: 500 });
    }
}
