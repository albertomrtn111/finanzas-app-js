import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import BusinessSidebar from '@/components/business/BusinessSidebar';
import prisma from '@/lib/db';

export default async function PerfilLayout({ children }) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login');
    }
    const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) }, select: { account_mode: true, businesses: { select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 1 } } });
    if (user?.account_mode === 'UNSET') redirect('/elegir-cuenta');
    const business = user?.account_mode === 'COMPANY' ? user.businesses[0] : null;

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            {business ? <BusinessSidebar business={business} /> : <Sidebar />}
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
