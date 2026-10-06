import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { email, password, name, accountMode, businessName, businessKind } = body;

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
        if (password.length < 8 || password.length > 72) {
            return NextResponse.json(
                { error: 'La contraseña debe tener entre 8 y 72 caracteres' },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim()) || email.trim().length > 255 || name.trim().length > 100) {
            return NextResponse.json(
                { error: 'Email o nombre inválido' },
                { status: 400 }
            );
        }

        const emailNormalized = email.toLowerCase().trim();
        const nameTrimmed = name.trim();
        if (!['PERSONAL', 'COMPANY', 'BOTH'].includes(accountMode)) {
            return NextResponse.json({ error: 'Elige el tipo de cuenta' }, { status: 400 });
        }
        if (accountMode !== 'PERSONAL' && (!businessName || typeof businessName !== 'string' || !businessName.trim() || businessName.trim().length > 120 || !['SELF_EMPLOYED', 'COMPANY'].includes(businessKind))) {
            return NextResponse.json({ error: 'Indica el nombre y tipo de negocio' }, { status: 400 });
        }

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
        const user = await prisma.$transaction(async tx => {
            const created = await tx.user.create({
                data: {
                    name: nameTrimmed,
                    email: emailNormalized,
                    password_hash,
                    account_mode: accountMode,
                    onboarding_step: accountMode === 'COMPANY' ? 5 : 0,
                    created_at: new Date(),
                }
            });
            if (accountMode !== 'PERSONAL') {
                await tx.business.create({ data: { owner_user_id: created.id, name: businessName.trim(), kind: businessKind } });
            }
            return created;
        });

        return NextResponse.json({
            message: 'Cuenta creada correctamente',
            user: { id: user.id, email: user.email, name: user.name, accountMode: user.account_mode }
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
