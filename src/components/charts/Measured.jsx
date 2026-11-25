'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import styles from './charts.module.css';

const MOBILE_QUERY = '(max-width: 767px)';

function subscribeMobile(callback) {
    const media = window.matchMedia(MOBILE_QUERY);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
}

// true en pantallas de menos de 768 px. En el servidor, false.
export function useIsMobile() {
    return useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

// Tamaño de un elemento con ResizeObserver. Solo cambia si cambia el ancho o el alto en píxeles enteros,
// y el gráfico se vuelve a pintar con el tamaño nuevo, sin desmontarse (Tarea NF-20).
export function useElementSize() {
    const [node, setNode] = useState(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        if (!node) return undefined;
        const observer = new ResizeObserver(([entry]) => {
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);
            setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);
    return [setNode, size];
}

// Ocupa la caja del marco (alto fijo) y pinta render({ width, height, isMobile }) en cuanto la mide.
// Ni el desplazamiento en iPhone (la barra de Safari cambia el alto de la ventana, no el de la caja) ni
// abrir y cerrar el menú lateral vuelven a montar el gráfico.
export default function Measured({ render }) {
    const [ref, { width, height }] = useElementSize();
    const isMobile = useIsMobile();
    return (
        <div ref={ref} className={styles.fill}>
            {width > 0 && height > 0 ? render({ width, height, isMobile }) : null}
        </div>
    );
}
