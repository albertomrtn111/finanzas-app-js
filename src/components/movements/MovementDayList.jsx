'use client';

import { Money, VisuallyHidden } from '@/components/ui';
import { formatDayHeading } from '@/lib/dateFormat';
import { KIND_TEXT, movementSummary } from '@/lib/movementForm';
import { groupByDay } from '@/lib/movementList';
import styles from './movements.module.css';

// Movimientos agrupados por día («Hoy», «Ayer», «lunes, 23 de noviembre») con el total de cada día.
// Filas en vez de tabla: sin desplazamiento horizontal en el móvil. Al pulsar una fila se edita.
export default function MovementDayList({ kind, items, onOpen, onDelete, busy = false }) {
    const { one } = KIND_TEXT[kind];
    return (
        <div className={`${styles.days} ${busy ? styles.busy : ''}`.trim()} aria-busy={busy || undefined}>
            {groupByDay(items).map(group => {
                const headingId = `dia-${kind}-${group.day}`;
                return (
                    <section key={group.day} className={styles.day} aria-labelledby={headingId}>
                        <div className={styles.dayHeader}>
                            <h3 id={headingId} className={styles.dayTitle}>{formatDayHeading(group.day)}</h3>
                            <span className={styles.dayTotal}>
                                <VisuallyHidden>Total del día: </VisuallyHidden>
                                <Money value={group.totalCents / 100} tone={kind === 'income' ? 'positive' : undefined} />
                            </span>
                        </div>
                        <ul className={styles.rows}>
                            {group.items.map(item => {
                                const details = kind === 'expense'
                                    ? [item.subcategory, item.notes, item.payment_method]
                                    : [item.source, item.notes];
                                const meta = details.filter(Boolean).join(' · ');
                                return (
                                    <li key={item.id} className={styles.row}>
                                        <button type="button" className={styles.rowMain} onClick={() => onOpen(item)}>
                                            <span className={styles.rowText}>
                                                <span className={styles.rowTitle}>
                                                    <VisuallyHidden>Editar {one}: </VisuallyHidden>
                                                    {item.category}
                                                </span>
                                                {meta && <span className={styles.rowMeta}>{meta}</span>}
                                            </span>
                                            <Money className={styles.rowAmount} value={item.amount} tone={kind === 'income' ? 'positive' : undefined} />
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.rowDelete}
                                            onClick={() => onDelete(item)}
                                            aria-label={`Eliminar ${one} de ${movementSummary(item)}`}
                                            title={`Eliminar ${one}`}
                                        >
                                            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                                                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
