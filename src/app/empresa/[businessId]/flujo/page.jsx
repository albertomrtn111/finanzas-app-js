'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { euro, shortDate, todayKey, businessRequest, PageHeader, StatCard, LoadState, EmptyState, useBusinessData } from '@/components/business/ui';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function CashFlowPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['summary', 'movements', 'activities', 'plans']);
    const [year, setYear] = useState(new Date().getFullYear());
    const [plan, setPlan] = useState({ direction: 'EXPENSE', description: '', category: '', due_on: todayKey(), amount: '' });
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const summary = data.summary;
    const monthly = useMemo(() => {
        const rows = MONTHS.map((label, index) => ({ label, index, in: 0, out: 0 }));
        for (const movement of data.movements || []) {
            if (movement.flow_type === 'TRANSFER') continue;
            const date = new Date(movement.date);
            if (date.getUTCFullYear() !== year) continue;
            const row = rows[date.getUTCMonth()];
            if (Number(movement.amount) > 0) row.in += Number(movement.amount);
            else row.out += Math.abs(Number(movement.amount));
        }
        return rows;
    }, [data.movements, year]);
    const max = Math.max(1, ...monthly.flatMap(row => [row.in, row.out]));
    const upcoming = useMemo(() => {
        const activities = (data.activities || []).map(item => ({
            id: `a${item.id}`, description: item.description, due_on: item.due_on,
            direction: item.direction, amount: Math.max(0, Number(item.total_amount) - item.allocations.reduce((sum, a) => sum + Number(a.amount), 0)), source: 'Pendiente'
        })).filter(item => item.amount > 0 && item.due_on);
        const plans = (data.plans || []).filter(item => item.status === 'PLANNED').map(item => ({ ...item, id: `p${item.id}`, source: 'Previsión' }));
        return [...activities, ...plans].sort((a, b) => new Date(a.due_on) - new Date(b.due_on));
    }, [data.activities, data.plans]);
    const savePlan = async event => {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await businessRequest(`/api/businesses/${businessId}/plans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) }); setPlan({ direction: 'EXPENSE', description: '', category: '', due_on: todayKey(), amount: '' }); await refresh(); }
        catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const markDone = async item => {
        try { await businessRequest(`/api/businesses/${businessId}/plans`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(item.id.slice(1)), status: 'DONE' }) }); await refresh(); }
        catch (cause) { setMessage(cause.message); }
    };
    return <div className="page-container business-page"><PageHeader title="Flujo y previsión" subtitle="Dinero real por fecha de banco y compromisos futuros por vencimiento" />
        <LoadState loading={loading} error={error} retry={refresh} />
        {summary && <><div className="business-kpi-grid"><StatCard label="Líquido hoy" value={euro(summary.liquid)} /><StatCard label="Flujo de este mes" value={euro(summary.monthFlow)} /><StatCard label="Previsión a 30 días" value={euro(summary.projected30)} /><StatCard label="Previsión a 90 días" value={euro(summary.projected90)} /></div>
            <p className="business-helper">Las previsiones suman pendientes de cobro y pago y planes introducidos aquí. Marca un plan como realizado cuando lo registres como movimiento.</p>
            <div className="card business-spaced"><div className="card-header business-line"><h2>Flujo de caja real</h2><select className="form-input form-select business-filter" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Año">{[year - 1, year, year + 1].map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="card-body"><div className="business-flow-chart">{monthly.map(row => <div key={row.index} className="business-flow-row"><span>{row.label}</span><div className="business-flow-bars"><div className="business-flow-in" style={{ width: `${row.in / max * 100}%` }} aria-label={`Entradas ${euro(row.in)}`} /><div className="business-flow-out" style={{ width: `${row.out / max * 100}%` }} aria-label={`Salidas ${euro(row.out)}`} /></div><small>{euro(row.in - row.out)}</small></div>)}</div><div className="business-flow-legend"><span>● Entradas</span><span>● Salidas</span></div></div></div>
            <div className="card business-spaced"><div className="card-header"><h2>Próximos cobros y pagos</h2></div><div className="card-body">{upcoming.length ? <div className="business-list">{upcoming.map(item => <div key={item.id} className="business-line business-upcoming"><div><strong>{item.description}</strong><small>{item.source} · {shortDate(item.due_on)}</small></div><div><strong className={item.direction === 'INCOME' ? 'business-positive' : 'business-negative'}>{item.direction === 'INCOME' ? '+' : '−'}{euro(item.amount)}</strong>{item.source === 'Previsión' && <button className="business-link-button" onClick={() => markDone(item)}>Marcar realizada</button>}</div></div>)}</div> : <EmptyState text="No hay vencimientos ni previsiones pendientes." />}</div></div>
            <div className="card business-form-card"><div className="card-header"><h2>Añadir previsión futura</h2></div><div className="card-body"><form onSubmit={savePlan} className="business-form-grid"><div className="form-group"><label className="form-label" htmlFor="planDirection">Tipo</label><select id="planDirection" className="form-input form-select" value={plan.direction} onChange={e => setPlan({ ...plan, direction: e.target.value })}><option value="INCOME">Cobro previsto</option><option value="EXPENSE">Pago previsto</option></select></div><div className="form-group"><label className="form-label" htmlFor="planDue">Fecha prevista</label><input id="planDue" type="date" className="form-input" value={plan.due_on} onChange={e => setPlan({ ...plan, due_on: e.target.value })} required /></div><div className="form-group"><label className="form-label" htmlFor="planDescription">Concepto</label><input id="planDescription" className="form-input" value={plan.description} onChange={e => setPlan({ ...plan, description: e.target.value })} required /></div><div className="form-group"><label className="form-label" htmlFor="planCategory">Categoría</label><input id="planCategory" className="form-input" value={plan.category} onChange={e => setPlan({ ...plan, category: e.target.value })} required /></div><div className="form-group"><label className="form-label" htmlFor="planAmount">Importe</label><input id="planAmount" type="number" min="0.01" step="0.01" className="form-input" value={plan.amount} onChange={e => setPlan({ ...plan, amount: e.target.value })} required /></div>{message && <div className="alert alert-danger business-full" role="alert">{message}</div>}<button className="btn btn-primary business-full" disabled={saving}>{saving ? 'Guardando...' : 'Añadir previsión'}</button></form></div></div>
        </>}
    </div>;
}
