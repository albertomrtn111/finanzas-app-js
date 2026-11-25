'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatPct } from '@/lib/moneyFormat';
import { jsonRequest, requestJson } from '@/lib/utils';
import { EmptyState, Field, LoadState, Money, useFeedback } from '@/components/ui';

const TABS = {
    expense: { label: 'Categorías de gasto', singular: 'gasto' },
    income: { label: 'Categorías de ingreso', singular: 'ingreso' },
};

// Total, número de movimientos y media mensual por categoría, recorriendo los movimientos una sola vez.
function statsByCategory(movements) {
    const groups = new Map();
    let total = 0;
    for (const movement of movements) {
        const amount = Number(movement.amount) || 0;
        total += amount;
        const group = groups.get(movement.category) || { total: 0, count: 0, months: new Set() };
        group.total += amount;
        group.count += 1;
        group.months.add(String(movement.date).slice(0, 7));
        groups.set(movement.category, group);
    }
    const stats = new Map();
    for (const [category, group] of groups) {
        stats.set(category, {
            total: group.total,
            count: group.count,
            monthlyAvg: group.total / Math.max(group.months.size, 1),
            pctOfTotal: total > 0 ? (group.total / total) * 100 : 0,
        });
    }
    return stats;
}

export default function CategoriasPage() {
    const { toast, confirm } = useFeedback();
    const [tab, setTab] = useState('expense');
    const [data, setData] = useState({ expense: [], income: [], expenses: [], incomes: [] });
    const [newName, setNewName] = useState('');
    const [nameError, setNameError] = useState('');
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            const [expense, income, expenses, incomes] = await Promise.all([
                requestJson('/api/categories?type=expense'),
                requestJson('/api/categories?type=income'),
                requestJson('/api/expenses'),
                requestJson('/api/income'),
            ]);
            setData({ expense, income, expenses, incomes });
            setStatus({ loading: false, error: '' });
        } catch (error) {
            if (silent) toast({ type: 'error', text: `No se ha podido actualizar la lista: ${error.message}`, action: { label: 'Recargar', onClick: () => window.location.reload() } });
            else setStatus({ loading: false, error: error.message });
        }
    }, [toast]);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

    const expenseStats = useMemo(() => statsByCategory(data.expenses), [data.expenses]);
    const incomeStats = useMemo(() => statsByCategory(data.incomes), [data.incomes]);
    const categoryStats = tab === 'expense' ? expenseStats : incomeStats;
    const categories = data[tab];

    const handleAdd = async (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) {
            setNameError('Escribe el nombre de la categoría');
            document.getElementById('categoria-nombre')?.focus();
            return;
        }

        setSaving(true);
        try {
            await requestJson('/api/categories', jsonRequest('POST', { name, type: tab }));
            toast({ text: `Categoría «${name}» añadida` });
            setNewName('');
            await loadData({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (name) => {
        const ok = await confirm({
            title: 'Eliminar categoría',
            text: `Se eliminará la categoría «${name}». No se puede deshacer.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;

        try {
            await requestJson(`/api/categories?name=${encodeURIComponent(name)}&type=${tab}`, { method: 'DELETE' });
            setData(current => ({ ...current, [tab]: current[tab].filter(cat => cat.name !== name) }));
            toast({ text: `Categoría «${name}» eliminada` });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Categorías</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={() => loadData()} label="Cargando tus categorías…" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Categorías</h1>
                <p className="page-subtitle">Gestiona las categorías de gastos e ingresos</p>
            </div>

            <div className="tabs" role="group" aria-label="Tipo de categoría">
                {Object.entries(TABS).map(([key, item]) => (
                    <button
                        key={key}
                        type="button"
                        className={`tab ${tab === key ? 'active' : ''}`.trim()}
                        aria-pressed={tab === key}
                        onClick={() => { setTab(key); setNameError(''); }}
                    >
                        {item.label} ({data[key].length})
                    </button>
                ))}
            </div>

            <div className="grid grid-2 gap-lg">
                <section className="card" aria-labelledby="categorias-lista-titulo">
                    <div className="card-header">
                        <h2 id="categorias-lista-titulo">{TABS[tab].label}</h2>
                    </div>
                    <div className="card-body">
                        {categories.length === 0 ? (
                            <EmptyState title="Todavía no hay categorías" text={`Añade tu primera categoría de ${TABS[tab].singular} con el formulario.`} />
                        ) : (
                            <ul className="record-list">
                                {categories.map((cat) => {
                                    const stats = categoryStats.get(cat.name);
                                    const inUse = Boolean(stats?.count);
                                    return (
                                        <li key={cat.id} className="record-item">
                                            <div className="record-item-head">
                                                <span className="font-semibold">{cat.name}</span>
                                                {inUse ? (
                                                    <span className="text-muted text-sm">En uso</span>
                                                ) : (
                                                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(cat.name)} aria-label={`Eliminar la categoría ${cat.name}`}>
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                            {stats ? (
                                                <dl className="stat-grid">
                                                    <div><dt>Media mensual</dt><dd><Money value={stats.monthlyAvg} /></dd></div>
                                                    <div><dt>Parte del total</dt><dd>{formatPct(stats.pctOfTotal)}</dd></div>
                                                    <div><dt>Movimientos</dt><dd>{stats.count}</dd></div>
                                                </dl>
                                            ) : (
                                                <p className="record-item-note">Sin movimientos todavía.</p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>

                <section className="card" aria-labelledby="categorias-nueva-titulo">
                    <div className="card-header">
                        <h2 id="categorias-nueva-titulo">Añadir categoría de {TABS[tab].singular}</h2>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleAdd} noValidate>
                            <Field label="Nombre de la categoría" htmlFor="categoria-nombre" error={nameError}>
                                <input
                                    id="categoria-nombre"
                                    type="text"
                                    className="form-input"
                                    placeholder={tab === 'expense' ? 'Por ejemplo, Alimentación' : 'Por ejemplo, Nómina'}
                                    maxLength={100}
                                    value={newName}
                                    onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
                                    aria-invalid={Boolean(nameError)}
                                    aria-describedby={nameError ? 'categoria-nombre-error' : undefined}
                                    required
                                />
                            </Field>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Añadiendo…' : 'Añadir categoría'}
                                </button>
                            </div>
                        </form>

                        <p className="alert alert-info mt-lg">
                            Las categorías con movimientos (o, en gastos, con presupuesto) no se pueden eliminar.
                            Antes tendrás que eliminar o cambiar de categoría esos movimientos.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
