import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Listar productos de inversión
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);

        const products = await prisma.investmentProduct.findMany({
            where: { user_id: userId },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json(products);
    } catch (error) {
        console.error('Error obteniendo productos:', error);
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
    }
}

// POST - Crear producto
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { name, asset_type } = await request.json();

        if (!name?.trim() || !asset_type?.trim()) {
            return NextResponse.json({ error: 'Nombre y tipo de activo son obligatorios' }, { status: 400 });
        }

        const product = await prisma.investmentProduct.create({
            data: {
                user_id: userId,
                name: name.trim(),
                asset_type: asset_type.trim(),
                created_at: new Date(),
            },
        });

        return NextResponse.json(product);
    } catch (error) {
        console.error('Error creando producto:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Este producto ya existe' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Error al crear' }, { status: 500 });
    }
}

// PUT - Actualizar producto
export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { id, name, asset_type } = await request.json();

        const existing = await prisma.investmentProduct.findFirst({
            where: { id: parseInt(id), user_id: userId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        const product = await prisma.investmentProduct.update({
            where: { id: parseInt(id) },
            data: {
                name: name.trim(),
                asset_type: asset_type.trim(),
            },
        });

        return NextResponse.json(product);
    } catch (error) {
        console.error('Error actualizando producto:', error);
        return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
    }
}

// DELETE - Eliminar producto
export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const userId = parseInt(session.user.id);
        const { searchParams } = new URL(request.url);
        const id = parseInt(searchParams.get('id'));

        const product = await prisma.investmentProduct.findFirst({
            where: { id, user_id: userId },
        });

        if (!product) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        await prisma.investmentProduct.delete({ where: { id } });

        return NextResponse.json({ message: 'Producto eliminado' });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
