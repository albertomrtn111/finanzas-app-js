'use client';

import { useEffect } from 'react';
import { RouteError } from '@/components/RouteFallbacks';

// Si falla la carga de una página, se dice así y se ofrece «Reintentar» (Tarea NF-20).
// El menú lateral sigue visible: el error solo sustituye el contenido de la página.
export default function Error({ error, retry, reset }) {
    useEffect(() => {
        console.error('Error al cargar la página:', error);
    }, [error]);
    return <RouteError error={error} onRetry={() => (retry ?? reset)?.()} />;
}
