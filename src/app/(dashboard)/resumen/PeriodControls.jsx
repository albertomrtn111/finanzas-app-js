'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PeriodLink } from '@/components/charts/PeriodTabs';
import { MONTH_NAMES, resumenHref } from '@/lib/resumenView';
import styles from './resumen.module.css';

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

// Selector de periodo del Resumen (Tarea NF-20). El periodo vive en la URL: /resumen?anio=2026&mes=3.
// Cambiarlo pide al servidor la página ya pintada con los datos; mientras llega, el selector muestra la
// elección nueva y un indicador de carga.
export default function PeriodControls({ period, years, today, isCurrentMonth }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [shown, setShown] = useOptimistic(period);

    const go = next => {
        startTransition(() => {
            setShown(next);
            router.push(resumenHref(next, today), { scroll: false });
        });
    };

    const currentYear = Number(today.slice(0, 4));
    return (
        <div className={styles.controls}>
            <nav className="segmented-control" aria-label="Periodo">
                <PeriodLink href="/resumen" active={isCurrentMonth} className="segmented-btn">Este mes</PeriodLink>
                <PeriodLink href={resumenHref({ view: 'year', year: shown.year }, today)} active={shown.view === 'year'} className="segmented-btn">
                    <span className="visible-mobile">Año</span>
                    <span className="hidden-mobile">Año completo</span>
                </PeriodLink>
            </nav>

            <select
                className="form-input form-select"
                aria-label="Año"
                value={shown.year}
                onChange={event => go({ ...shown, year: Number(event.target.value) })}
                style={{ minWidth: '100px' }}
            >
                {years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>

            {shown.view === 'month' && (
                <select
                    className="form-input form-select"
                    aria-label="Mes"
                    value={shown.month}
                    onChange={event => go({ ...shown, month: Number(event.target.value) })}
                    style={{ minWidth: '130px' }}
                >
                    {MONTH_NAMES.map((name, index) => (
                        <option key={name} value={index}>{capitalize(name)}{shown.year === currentYear && index === Number(today.slice(5, 7)) - 1 ? ' (en curso)' : ''}</option>
                    ))}
                </select>
            )}
            <span className={`${styles.busy} ${isPending ? styles.busyOn : ''}`} role="status" aria-live="polite">
                {isPending ? 'Cargando…' : ''}
            </span>
        </div>
    );
}
