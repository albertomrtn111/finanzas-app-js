import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { businessContext } from '@/lib/businessAccess';
import { summarizeBusiness } from '@/lib/business';

export async function GET(_request, { params }) {
    const { businessId } = await params;
    const context = await businessContext(businessId);
    if (context.response) return context.response;
    const [accounts, activities, movements, plans] = await Promise.all([
        prisma.businessAccount.findMany({ where: { business_id: context.business.id } }),
        prisma.businessActivity.findMany({ where: { business_id: context.business.id }, include: { allocations: true } }),
        prisma.businessMovement.findMany({ where: { business_id: context.business.id } }),
        prisma.businessCashPlan.findMany({ where: { business_id: context.business.id } }),
    ]);
    return NextResponse.json({ business: context.business, ...summarizeBusiness({ accounts, activities, movements, plans }) });
}
