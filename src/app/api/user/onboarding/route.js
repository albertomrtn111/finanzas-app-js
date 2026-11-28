import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import prisma from '@/lib/db';

// GET - Get current onboarding step
export async function GET(request) {
    try {
        const auth = await requireUser();
        if (auth.response) return auth.response;
        const { userId } = auth;

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
        const auth = await requireUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { step } = await request.json().catch(() => ({}));

        // Validate step (0-5)
        if (!Number.isInteger(step) || step < 0 || step > 5) {
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
