import { NextResponse } from 'next/server';
import { requirePersonalUser } from '@/lib/session';
import { createLogged, deleteLogged, logChange, newBatchId, webContext } from '@/lib/changeLog';
import prisma from '@/lib/db';
import { parseId } from '@/lib/apiValidation';
import { badRequest } from '@/lib/apiResponses';

const validProduct = (name, assetType) =>
    typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 150 &&
    typeof assetType === 'string' && assetType.trim().length > 0 && assetType.trim().length <= 100;

// GET - Listar productos de inversión
export async function GET(request) {
    try {
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;

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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { name, asset_type } = await request.json().catch(() => ({}));

        if (!validProduct(name, asset_type)) return badRequest('Nombre o tipo de activo inválido');

        const product = await prisma.$transaction(tx => createLogged(tx, webContext(userId, 'productos-inversion:crear'), 'investment_product', {
            user_id: userId,
            name: name.trim(),
            asset_type: asset_type.trim(),
            created_at: new Date(),
        }));

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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { id, name, asset_type } = await request.json().catch(() => ({}));
        const productId = parseId(id);
        if (!productId || !validProduct(name, asset_type)) return badRequest('Producto inválido');

        // El producto y sus registros de inversión cambian juntos: un solo lote en el registro de cambios.
        const change = { ...webContext(userId, 'productos-inversion:editar'), batchId: newBatchId() };
        const product = await prisma.$transaction(async (tx) => {
            const existing = await tx.investmentProduct.findFirst({ where: { id: productId, user_id: userId } });
            if (!existing) return null;
            const updated = await tx.investmentProduct.update({
                where: { id: productId },
                data: { name: name.trim(), asset_type: asset_type.trim() },
            });
            await logChange(tx, change, { entity: 'investment_product', entityId: updated.id, action: 'UPDATE', before: existing, after: updated });
            const affected = await tx.investment.findMany({ where: { user_id: userId, account: existing.name } });
            for (const record of affected) {
                const changed = await tx.investment.update({ where: { id: record.id }, data: { account: updated.name, asset_type: updated.asset_type } });
                await logChange(tx, change, { entity: 'investment', entityId: record.id, action: 'UPDATE', before: record, after: changed });
            }
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
        const auth = await requirePersonalUser();
        if (auth.response) return auth.response;
        const { userId } = auth;
        const { searchParams } = new URL(request.url);
        const id = parseId(searchParams.get('id'));
        if (!id) return badRequest('Identificador inválido');

        const deleted = await prisma.$transaction(tx => deleteLogged(tx, webContext(userId, 'productos-inversion:borrar'), 'investment_product', { id, user_id: userId }));
        if (!deleted) {
            return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Producto eliminado' });
    } catch (error) {
        console.error('Error eliminando producto:', error);
        return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
    }
}
