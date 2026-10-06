import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import Sidebar from '@/components/Sidebar';

export default async function DashboardLayout({ children }) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login');
    }

    // Check onboarding status before rendering any private dashboard page.
    let user;
    try {
        user = await prisma.user.findUnique({
            where: { id: parseInt(session.user.id) },
            select: { onboarding_step: true, account_mode: true }
        });
    } catch (error) {
        console.error('Error checking onboarding status:', error);
        throw error;
    }
    if (!user) redirect('/login');
    if (user.account_mode === 'UNSET') redirect('/elegir-cuenta');
    if (user.account_mode === 'COMPANY') redirect('/empresa');
    if (user.onboarding_step < 5) redirect('/onboarding');

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
