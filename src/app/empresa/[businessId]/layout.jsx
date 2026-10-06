import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import BusinessSidebar from '@/components/business/BusinessSidebar';

export default async function BusinessLayout({ children, params }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect('/login');
    const { businessId } = await params;
    const id = Number(businessId);
    if (!Number.isSafeInteger(id) || id < 1) notFound();
    const business = await prisma.business.findFirst({ where: { id, owner_user_id: Number(session.user.id) }, select: { id: true, name: true } });
    if (!business) notFound();
    return <div style={{ display: 'flex', minHeight: '100vh' }}>
        <BusinessSidebar business={business} />
        <main className="main-content business-main">{children}</main>
    </div>;
}
