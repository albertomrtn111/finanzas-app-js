import MovementManager from '@/components/business/MovementManager';

export default async function Page({ searchParams }) {
    const query = await searchParams;
    return <MovementManager initialAccountId={query?.accountId || ''} initialActivityId={query?.activityId || ''} />;
}
