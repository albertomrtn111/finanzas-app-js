import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email y contraseña son obligatorios' },
                { status: 400 }
            );
        }

        const emailNormalized = email.toLowerCase().trim();

        // Verificar si el usuario ya existe
        const existingUser = await prisma.user.findUnique({
            where: { email: emailNormalized }
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'Este email ya está registrado' },
                { status: 400 }
            );
        }

        // Crear hash de la contraseña
        const password_hash = await bcrypt.hash(password, 10);

        // Crear usuario
        const user = await prisma.user.create({
            data: {
                email: emailNormalized,
                password_hash,
                created_at: new Date(),
            }
        });

        return NextResponse.json({
            message: 'Cuenta creada correctamente',
            user: { id: user.id, email: user.email }
        });

    } catch (error) {
        console.error('Error en registro:', error);
        return NextResponse.json(
            { error: 'Error al crear la cuenta' },
            { status: 500 }
        );
    }
}
