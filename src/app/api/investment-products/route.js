import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';

const validProduct = (name, assetType) =>
    typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 150 &&
    typeof assetType === 'string' && assetType.trim().length > 0 && assetType.trim().length <= 100;

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
        const { name, asset_type } = await request.json().catch(() => ({}));

        if (!validProduct(name, asset_type)) return badRequest('Nombre o tipo de activo inválido');

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
        const { id, name, asset_type } = await request.json().catch(() => ({}));
        const productId = parseId(id);
        if (!productId || !validProduct(name, asset_type)) return badRequest('Producto inválido');

        const product = await prisma.$transaction(async (tx) => {
            const existing = await tx.investmentProduct.findFirst({ where: { id: productId, user_id: userId } });
            if (!existing) return null;
            const updated = await tx.investmentProduct.update({
                where: { id: productId },
                data: { name: name.trim(), asset_type: asset_type.trim() },
            });
            await tx.investment.updateMany({
                where: { user_id: userId, account: existing.name },
                data: { account: updated.name, asset_type: updated.asset_type },
            });
            return updated;
        });
        if (!product) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        return NextResponse.json(product);
    } catch (error) {
        console.error('Error actualizando producto:', error);
        if (error.code === 'P2002') return badRequest('Este producto ya existe');
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
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        const deleted = await prisma.investmentProduct.deleteMany({ where: { id, user_id: userId } });
        if (!deleted.count) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Producto eliminado' });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
