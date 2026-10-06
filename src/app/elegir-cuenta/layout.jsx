import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export default async function AccountChoiceLayout({ children }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect('/login');
    const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) }, select: { account_mode: true } });
    if (!user) redirect('/login');
    if (user.account_mode !== 'UNSET') redirect(user.account_mode === 'COMPANY' ? '/empresa' : '/');
    return children;
}
