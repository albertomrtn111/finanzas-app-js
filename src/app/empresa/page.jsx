import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';

export default async function EmpresaIndex() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) redirect('/login');
    const user = await prisma.user.findUnique({ where: { id: Number(session.user.id) }, select: { account_mode: true } });
    if (user?.account_mode === 'UNSET') redirect('/elegir-cuenta');
    const business = await prisma.business.findFirst({ where: { owner_user_id: Number(session.user.id) }, orderBy: { id: 'asc' }, select: { id: true } });
    if (!business) redirect('/empresa/nueva');
    redirect(`/empresa/${business.id}/resumen`);
}
