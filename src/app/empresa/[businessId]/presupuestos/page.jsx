'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { cents, todayInMadrid } from '@/lib/business';
import { euro, businessRequest, PageHeader, LoadState, EmptyState, useBusinessData } from '@/components/business/ui';

export default function BusinessBudgetsPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['budgets', 'activities']);
    const [period, setPeriod] = useState(() => todayInMadrid().slice(0, 7));
    const [form, setForm] = useState({ direction: 'EXPENSE', category: '', amount: '' });
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const rows = useMemo(() => {
        const map = new Map();
        for (const budget of data.budgets || []) {
            if (budget.period !== period) continue;
            const key = `${budget.direction}:${budget.category}`;
            map.set(key, { direction: budget.direction, category: budget.category, budget: cents(budget.amount), actual: 0, id: budget.id });
        }
        for (const item of data.activities || []) {
            if (item.occurred_on.slice(0, 7) !== period) continue;
            const key = `${item.direction}:${item.category}`;
            const row = map.get(key) || { direction: item.direction, category: item.category, budget: 0, actual: 0, id: null };
            row.actual += cents(item.base_amount) + (item.direction === 'EXPENSE' ? cents(item.vat_amount, { allowZero: true }) - cents(item.deductible_vat, { allowZero: true }) : 0);
            map.set(key, row);
        }
        return [...map.values()].sort((a, b) => a.direction.localeCompare(b.direction) || a.category.localeCompare(b.category));
    }, [data.budgets, data.activities, period]);
    const save = async event => {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await businessRequest(`/api/businesses/${businessId}/budgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, period }) }); setForm({ direction: 'EXPENSE', category: '', amount: '' }); await refresh(); setMessage('Presupuesto guardado.'); }
        catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const remove = async row => {
        if (!window.confirm(`¿Eliminar el presupuesto de ${row.category}?`)) return;
        try { await businessRequest(`/api/businesses/${businessId}/budgets?id=${row.id}`, { method: 'DELETE' }); await refresh(); }
        catch (cause) { setMessage(cause.message); }
    };
    return <div className="page-container business-page"><PageHeader title="Presupuestos" subtitle="Compara lo previsto con ingresos y gastos incurridos, sin mezclar pagos" />
        <div className="business-section-head"><label className="form-label" htmlFor="budgetPeriod">Mes</label><input id="budgetPeriod" type="month" className="form-input business-filter" value={period} onChange={e => setPeriod(e.target.value)} /></div>
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && <div className="card business-spaced"><div className="card-header"><h2>Comparación por categoría</h2></div><div className="card-body">{rows.length ? <div className="business-list">{rows.map(row => <div key={`${row.direction}:${row.category}`} className="business-line business-upcoming"><div><strong>{row.category}</strong><small>{row.direction === 'INCOME' ? 'Ingreso' : 'Gasto'} · Presupuesto {euro(row.budget / 100)}</small></div><div><strong>{euro(row.actual / 100)}</strong><small>Desviación {euro((row.actual - row.budget) / 100)}</small>{row.id && <button className="business-link-button" onClick={() => remove(row)}>Quitar presupuesto</button>}</div></div>)}</div> : <EmptyState text="Aún no hay presupuestos ni operaciones en este mes." />}</div></div>}
        <div className="card business-form-card"><div className="card-header"><h2>Fijar presupuesto mensual</h2></div><div className="card-body"><form onSubmit={save} className="business-form-grid"><div className="form-group"><label className="form-label" htmlFor="budgetDirection">Tipo</label><select id="budgetDirection" className="form-input form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option></select></div><div className="form-group"><label className="form-label" htmlFor="budgetCategory">Categoría</label><input id="budgetCategory" className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} maxLength={100} required /></div><div className="form-group"><label className="form-label" htmlFor="budgetAmount">Importe</label><input id="budgetAmount" type="number" min="0.01" step="0.01" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>{message && <div className="alert alert-success business-full" role="status">{message}</div>}<button className="btn btn-primary business-full" disabled={saving}>{saving ? 'Guardando...' : 'Guardar presupuesto'}</button></form></div></div>
    </div>;
}
