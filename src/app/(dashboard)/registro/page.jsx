'use client';

import { useEffect, useRef, useState } from 'react';
import { EmptyState, LoadState, Money, useFeedback } from '@/components/ui';
import MovementDayList from '@/components/movements/MovementDayList';
import MovementFilters from '@/components/movements/MovementFilters';
import MovementForm from '@/components/movements/MovementForm';
import { useMovementDialog } from '@/components/movements/MovementsProvider';
import { fetchCategories, fetchMovements } from '@/components/movements/movementsApi';
import { useMovementActions, useMovementsChanged } from '@/components/movements/useMovementActions';
import styles from '@/components/movements/movements.module.css';
import { todayKey } from '@/lib/dateFormat';
import { KIND_TEXT } from '@/lib/movementForm';
import { EMPTY_FILTERS, PAGE_SIZE, filtersToQuery, hasActiveFilters, toCents } from '@/lib/movementList';

const MODES = [{ kind: 'expense', label: 'Gastos' }, { kind: 'income', label: 'Ingresos' }];
const EMPTY_LIST = { key: null, kind: null, items: [], count: 0, totalCents: 0, error: '' };

export default function RegistroPage() {
    const [kind, setKind] = useState('expense');
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [q, setQ] = useState('');
    const [list, setList] = useState(EMPTY_LIST);
    const [refresh, setRefresh] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [categories, setCategories] = useState({ kind: null, list: [] });
    const loaded = useRef({ key: null, size: 0 });
    const { openMovement } = useMovementDialog();
    const { remove } = useMovementActions();
    const { toast } = useFeedback();
    const text = KIND_TEXT[kind];

    // La búsqueda espera a que se deje de escribir; el resto de filtros se aplica al momento.
    useEffect(() => {
        const timer = setTimeout(() => setQ(filters.q), 300);
        return () => clearTimeout(timer);
    }, [filters.q]);

    const { query, errors } = filtersToQuery(filters, { today: todayKey(), q });
    const invalid = Boolean(errors);
    const requestKey = `${kind}?${query}`;
    const active = hasActiveFilters({ ...filters, q });

    useEffect(() => {
        if (invalid) return undefined;
        const controller = new AbortController();
        // Al recargar la misma lista (tras guardar o borrar) se pide lo que ya estaba cargado,
        // para no perder la posición; con filtros nuevos, la primera página.
        const limit = loaded.current.key === requestKey ? Math.min(500, Math.max(PAGE_SIZE, loaded.current.size)) : PAGE_SIZE;
        fetchMovements(kind, query, { limit, signal: controller.signal })
            .then(result => {
                loaded.current = { key: requestKey, size: result.items.length };
                setList({ key: requestKey, kind, items: result.items, count: result.count, totalCents: toCents(result.total), error: '' });
            })
            .catch(error => {
                if (!controller.signal.aborted) setList({ ...EMPTY_LIST, key: requestKey, kind, error: error.message });
            });
        return () => controller.abort();
    }, [kind, query, requestKey, refresh, invalid]);

    useEffect(() => {
        const controller = new AbortController();
        fetchCategories(kind, controller.signal)
            .then(result => setCategories({ kind, list: result }))
            // Sin categorías el filtro solo ofrece «Todas»; la lista enseña su propio error.
            .catch(() => {});
        return () => controller.abort();
    }, [kind, refresh]);

    // Cualquier alta, cambio, borrado o «Deshacer» (también desde el botón «+») recarga en segundo plano.
    useMovementsChanged(() => setRefresh(value => value + 1));

    const loading = !invalid && list.key !== requestKey;
    // Mientras llegan los resultados de un filtro nuevo se siguen viendo los anteriores, atenuados.
    const stale = loading && list.key !== null && list.kind === kind && !list.error;
    const hasMore = list.items.length < list.count;

    const changeKind = next => {
        setKind(next);
        setFilters(current => ({ ...current, category: '' }));
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setQ('');
    };

    const retry = () => {
        setList(EMPTY_LIST);
        setRefresh(value => value + 1);
    };

    const loadMore = async () => {
        if (loadingMore) return;
        setLoadingMore(true);
        try {
            const result = await fetchMovements(kind, query, { limit: PAGE_SIZE, offset: list.items.length });
            setList(current => {
                if (current.key !== requestKey) return current;
                const seen = new Set(current.items.map(item => item.id));
                const items = [...current.items, ...result.items.filter(item => !seen.has(item.id))];
                return { ...current, items, count: result.count, totalCents: toCents(result.total) };
            });
            loaded.current = { key: requestKey, size: list.items.length + result.items.length };
        } catch (error) {
            toast({ type: 'error', text: `No se han podido cargar más ${text.many}: ${error.message}` });
        } finally {
            setLoadingMore(false);
        }
    };

    const deleteItem = async item => {
        if (!(await remove(kind, item))) return;
        setList(current => (current.kind === kind ? {
            ...current,
            items: current.items.filter(other => other.id !== item.id),
            count: Math.max(0, current.count - 1),
            totalCents: current.totalCents - toCents(item.amount),
        } : current));
    };

    const showList = !invalid && list.items.length > 0 && (!loading || stale);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Registro de movimientos</h1>
                <p className="page-subtitle">Apunta, busca y corrige tus gastos e ingresos</p>
            </div>

            <div className={`tabs ${styles.modeTabs}`} role="group" aria-label="Qué movimientos ver">
                {MODES.map(mode => (
                    <button key={mode.kind} type="button" className={`tab ${kind === mode.kind ? 'active' : ''}`} aria-pressed={kind === mode.kind} onClick={() => changeKind(mode.kind)}>
                        {mode.label}
                    </button>
                ))}
            </div>

            {/* En el móvil se apunta con el botón «+»; aquí queda la lista. */}
            <section className={`card mb-lg ${styles.entryCard}`} aria-labelledby="registro-nuevo">
                <div className="card-header">
                    <h2 id="registro-nuevo" className={styles.cardTitle}>Nuevo {text.one}</h2>
                </div>
                <div className="card-body">
                    <MovementForm key={kind} kind={kind} />
                </div>
            </section>

            <section className="card" aria-labelledby="registro-historial">
                <div className="card-header">
                    <h2 id="registro-historial" className={styles.cardTitle}>Historial de {text.many}</h2>
                </div>
                <div className="card-body">
                    <MovementFilters
                        key={kind}
                        kind={kind}
                        filters={filters}
                        onChange={setFilters}
                        categories={categories.kind === kind ? categories.list : []}
                        errors={errors}
                    />

                    <div className={styles.resultBar}>
                        <p className={styles.resultText} aria-live="polite">
                            {invalid ? 'Revisa los filtros marcados para ver resultados.'
                                : list.key === requestKey && !list.error ? (
                                    <>
                                        <strong>{list.count} {list.count === 1 ? text.one : text.many}</strong>
                                        {active ? ' con estos filtros' : ''} · <Money value={list.totalCents / 100} tone={kind === 'income' ? 'positive' : undefined} />
                                    </>
                                ) : loading ? 'Buscando…' : ''}
                        </p>
                        {active && <button type="button" className={`btn btn-secondary btn-sm ${styles.clearButton}`} onClick={clearFilters}>Quitar filtros</button>}
                    </div>

                    {!invalid && (
                        <LoadState loading={loading && !stale} error={list.key === requestKey ? list.error : ''} onRetry={retry} label={`Cargando ${text.many}…`}>
                            {showList ? (
                                <>
                                    <MovementDayList kind={kind} items={list.items} busy={stale} onOpen={item => openMovement({ kind, record: item })} onDelete={deleteItem} />
                                    {hasMore && (
                                        <div className={styles.loadMore}>
                                            <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                                                {loadingMore ? 'Cargando…' : `Cargar más ${text.many} (${list.count - list.items.length} más)`}
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : active ? (
                                <EmptyState
                                    title={`Ningún ${text.one} coincide con los filtros`}
                                    text="Prueba con otras palabras u otras fechas, o quita los filtros."
                                    action={<button type="button" className="btn btn-secondary" onClick={clearFilters}>Quitar filtros</button>}
                                />
                            ) : (
                                <EmptyState
                                    title={`Aún no has apuntado ${text.many}`}
                                    text={`Cuando apuntes ${kind === 'expense' ? 'un gasto' : 'un ingreso'} aparecerá aquí, agrupado por días.`}
                                    action={<button type="button" className="btn btn-primary" onClick={() => openMovement({ kind })}>Añadir {text.one}</button>}
                                />
                            )}
                        </LoadState>
                    )}
                </div>
            </section>
        </div>
    );
}
