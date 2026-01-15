import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const { email, password, name } = body;

        // Validate required fields
        if (!email || typeof email !== 'string') {
            return NextResponse.json(
                { error: 'Email es obligatorio' },
                { status: 400 }
            );
        }

        if (!password || typeof password !== 'string') {
            return NextResponse.json(
                { error: 'Contraseña es obligatoria' },
                { status: 400 }
            );
        }

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { error: 'Nombre es obligatorio' },
                { status: 400 }
            );
        }

        // Validate password strength
        if (password.length < 8) {
            return NextResponse.json(
                { error: 'La contraseña debe tener al menos 8 caracteres' },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Formato de email inválido' },
                { status: 400 }
            );
        }

        const emailNormalized = email.toLowerCase().trim();
        const nameTrimmed = name.trim();

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: emailNormalized }
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'Este email ya está registrado. ¿Quieres iniciar sesión?' },
                { status: 409 } // 409 Conflict for duplicate resource
            );
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 12);

        // Create user
        const user = await prisma.user.create({
            data: {
                name: nameTrimmed,
                email: emailNormalized,
                password_hash,
                onboarding_step: 0,
                created_at: new Date(),
            }
        });

        return NextResponse.json({
            message: 'Cuenta creada correctamente',
            user: { id: user.id, email: user.email, name: user.name }
        }, { status: 201 });

    } catch (error) {
        console.error('Error en registro:', error);

        // Handle Prisma unique constraint error
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: 'Este email ya está registrado' },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { error: 'Error al crear la cuenta. Inténtalo de nuevo.' },
            { status: 500 }
        );
    }
}
