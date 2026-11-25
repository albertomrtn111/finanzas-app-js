'use client';

import Link, { useLinkStatus } from 'next/link';
import styles from './charts.module.css';

function PendingHint() {
    const { pending } = useLinkStatus();
    return <span aria-hidden="true" className={`${styles.pending} ${pending ? styles.pendingOn : ''}`.trim()} />;
}

// Enlace de periodo: cambia la URL (?anio=…, ?meses=…) sin subir al principio de la página.
// El servidor pinta la página nueva con los datos ya puestos; mientras, un indicador discreto.
export function PeriodLink({ href, active = false, className = '', children }) {
    return (
        <Link href={href} scroll={false} className={`${styles.periodLink} ${className} ${active ? 'active' : ''}`.trim()} aria-current={active ? 'true' : undefined}>
            {children}
            <PendingHint />
        </Link>
    );
}

// Pestañas de periodo. options: [{ href, label, active }].
export default function PeriodTabs({ options, label }) {
    return (
        <nav aria-label={label} className={styles.tabs}>
            {options.map(option => (
                <PeriodLink key={option.href} href={option.href} active={option.active} className={`${styles.tab} ${option.active ? styles.tabActive : ''}`}>
                    {option.label}
                </PeriodLink>
            ))}
        </nav>
    );
}
