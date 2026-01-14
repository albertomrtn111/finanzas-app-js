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

    // Check onboarding status
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(session.user.id) },
            select: { onboarding_step: true }
        });

        if (user && user.onboarding_step < 5) {
            redirect('/onboarding');
        }
    } catch (error) {
        console.error('Error checking onboarding status:', error);
        // Continue to dashboard if check fails
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}

