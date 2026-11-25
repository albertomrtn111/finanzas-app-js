import { PageSkeleton } from '@/components/RouteFallbacks';

// Se ve al instante al navegar, mientras el servidor prepara la página con sus datos (Tarea NF-20).
export default function Loading() {
    return <PageSkeleton />;
}
