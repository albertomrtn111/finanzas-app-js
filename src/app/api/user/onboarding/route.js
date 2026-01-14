import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Get current onboarding step
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboarding_step: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ onboardingStep: user.onboarding_step });
    } catch (error) {
        console.error('Error getting onboarding step:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// PATCH - Update onboarding step
export async function PATCH(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { step } = await request.json();

        // Validate step (0-5)
        if (typeof step !== 'number' || step < 0 || step > 5) {
            return NextResponse.json({ error: 'Step inválido (debe ser 0-5)' }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { onboarding_step: step },
            select: { id: true, onboarding_step: true }
        });

        return NextResponse.json({ onboardingStep: user.onboarding_step });
    } catch (error) {
        console.error('Error updating onboarding step:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}
