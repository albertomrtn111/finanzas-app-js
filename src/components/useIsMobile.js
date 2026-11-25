'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 768px)';

function subscribe(callback) {
    const media = window.matchMedia(QUERY);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
}

// true en pantallas de móvil, donde la barra lateral es un cajón que se abre y se cierra.
export default function useIsMobile() {
    return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
