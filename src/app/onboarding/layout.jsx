import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export default async function OnboardingLayout({ children }) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login');
    }
    const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) }, select: { account_mode: true } });
    if (user?.account_mode === 'UNSET') redirect('/elegir-cuenta');
    if (user?.account_mode === 'COMPANY') redirect('/empresa');

    return (
        <div className="onboarding-layout">
            {children}
        </div>
    );
}
