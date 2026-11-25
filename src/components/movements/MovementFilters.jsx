'use client';

import { useId, useState } from 'react';
import { AmountInput, Field } from '@/components/ui';
import { KIND_TEXT } from '@/lib/movementForm';
import { PERIODS } from '@/lib/movementList';
import styles from './movements.module.css';

// Buscador y filtros de Registro. Los valores son los que escribe el usuario; la pantalla los
// convierte en consulta con filtersToQuery y enseña aquí los errores (errors.min, .max, .range).
export default function MovementFilters({ kind, filters, onChange, categories = [], errors = null }) {
    const id = useId();
    const set = (field, value) => onChange({ ...filters, [field]: value });
    const { many } = KIND_TEXT[kind];
    const [amountOpen, setAmountOpen] = useState(() => Boolean(filters.min || filters.max));

    return (
        <form className={styles.filters} role="search" aria-label={`Buscar ${many}`} onSubmit={event => event.preventDefault()}>
            <Field label="Buscar" htmlFor={`${id}-q`} className={styles.filterSearch}>
                <input
                    id={`${id}-q`}
                    type="search"
                    className="form-input"
                    placeholder={kind === 'expense' ? 'Nota, categoría, método de pago…' : 'Nota, fuente, categoría…'}
                    enterKeyHint="search"
                    autoComplete="off"
                    maxLength={100}
                    value={filters.q}
                    onChange={event => set('q', event.target.value)}
                />
            </Field>
            <Field label="Categoría" htmlFor={`${id}-category`}>
                <select id={`${id}-category`} className="form-input form-select" value={filters.category} onChange={event => set('category', event.target.value)}>
                    <option value="">Todas</option>
                    {filters.category && !categories.some(category => category.name === filters.category) && <option value={filters.category}>{filters.category}</option>}
                    {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
            </Field>
            <Field label="Fechas" htmlFor={`${id}-period`}>
                <select id={`${id}-period`} className="form-input form-select" value={filters.period} onChange={event => set('period', event.target.value)}>
                    {PERIODS.map(period => <option key={period.value} value={period.value}>{period.label}</option>)}
                </select>
            </Field>
            {filters.period === 'month' && (
                <Field label="Mes" htmlFor={`${id}-month`}>
                    <input id={`${id}-month`} type="month" className="form-input" value={filters.month} onChange={event => set('month', event.target.value)} />
                </Field>
            )}
            {filters.period === 'range' && (
                <>
                    <Field label="Desde" htmlFor={`${id}-from`}>
                        <input id={`${id}-from`} type="date" className="form-input" value={filters.from} max={filters.to || undefined} onChange={event => set('from', event.target.value)} />
                    </Field>
                    <Field label="Hasta" htmlFor={`${id}-to`} error={errors?.range}>
                        <input id={`${id}-to`} type="date" className="form-input" value={filters.to} min={filters.from || undefined} onChange={event => set('to', event.target.value)} aria-invalid={errors?.range ? true : undefined} aria-describedby={errors?.range ? `${id}-to-error` : undefined} />
                    </Field>
                </>
            )}
            <details className={`${styles.more} ${styles.filterMore}`} open={amountOpen} onToggle={event => setAmountOpen(event.currentTarget.open)}>
                <summary>Filtrar por importe</summary>
                <div className={styles.pairRow}>
                    <Field label="Mínimo (€)" htmlFor={`${id}-min`} error={errors?.min}>
                        <AmountInput id={`${id}-min`} value={filters.min} onChange={value => set('min', value)} aria-invalid={errors?.min ? true : undefined} aria-describedby={errors?.min ? `${id}-min-error` : undefined} />
                    </Field>
                    <Field label="Máximo (€)" htmlFor={`${id}-max`} error={errors?.max}>
                        <AmountInput id={`${id}-max`} value={filters.max} onChange={value => set('max', value)} aria-invalid={errors?.max ? true : undefined} aria-describedby={errors?.max ? `${id}-max-error` : undefined} />
                    </Field>
                </div>
            </details>
        </form>
    );
}
