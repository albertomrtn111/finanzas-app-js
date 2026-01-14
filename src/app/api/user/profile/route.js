import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// PATCH - Update user profile (name only)
export async function PATCH(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { name } = await request.json();

        // Validation
        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        }

        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
        }

        if (trimmedName.length > 50) {
            return NextResponse.json({ error: 'El nombre no puede tener más de 50 caracteres' }, { status: 400 });
        }

        // Update user
        const user = await prisma.user.update({
            where: { id: userId },
            data: { name: trimmedName },
            select: { id: true, email: true, name: true }
        });

        return NextResponse.json(user);
    } catch (error) {
        console.error('Error updating profile:', error);
        return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 });
    }
}

// GET - Get current user profile
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                google_sub: true,
                password_hash: true
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        // Determine auth method
        const authMethod = user.google_sub ? 'google' : 'credentials';

        return NextResponse.json({
            id: user.id,
            email: user.email,
            name: user.name,
            authMethod
        });
    } catch (error) {
        console.error('Error getting profile:', error);
        return NextResponse.json({ error: 'Error al obtener perfil' }, { status: 500 });
    }
}
