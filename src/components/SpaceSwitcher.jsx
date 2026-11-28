'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import styles from './SpaceSwitcher.module.css';

// Selector de espacio financiero (personal y cada empresa), visible en las dos barras laterales.
// current: 'personal' o el id de la empresa en la que se está.
export default function SpaceSwitcher({ current }) {
    const { data: session } = useSession();
    const mode = session?.user?.accountMode;
    const [businesses, setBusinesses] = useState([]);

    useEffect(() => {
        if (!mode || mode === 'PERSONAL' || mode === 'UNSET') return undefined;
        let active = true;
        fetch('/api/businesses', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : []))
            .then(list => { if (active && Array.isArray(list)) setBusinesses(list); })
            .catch(() => {});
        return () => { active = false; };
    }, [mode]);

    const spaces = [
        ...(mode === 'BOTH' || mode === 'PERSONAL' ? [{ key: 'personal', label: 'Personal', href: '/', icon: '👤' }] : []),
        ...businesses.map(business => ({ key: String(business.id), label: business.name, href: `/empresa/${business.id}/resumen`, icon: '🏢' })),
    ];
    if (spaces.length < 2) return null;

    return (
        <nav className={styles.switcher} aria-label="Cambiar de espacio">
            <div className="sidebar-section">Tus espacios</div>
            {spaces.map(space => {
                const isCurrent = space.key === String(current);
                return (
                    <Link key={space.key} href={space.href} className={`sidebar-link ${isCurrent ? 'active' : ''}`} aria-current={isCurrent ? 'true' : undefined}>
                        <span aria-hidden="true">{space.icon}</span>
                        <span>{space.label}</span>
                        {isCurrent && <span className={styles.here}>Aquí</span>}
                    </Link>
                );
            })}
        </nav>
    );
}
