import { redirect } from 'next/navigation';

export default async function BusinessHome({ params }) {
    const { businessId } = await params;
    redirect(`/empresa/${businessId}/resumen`);
}
