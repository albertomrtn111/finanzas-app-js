'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { euro, shortDate, todayKey, businessRequest, PageHeader, LoadState, EmptyState, useBusinessData } from './ui';

const fresh = (accountId = '') => ({ account_id: accountId, date: todayKey(), direction: 'OUT', amount: '', description: '', flow_type: 'OPERATING', activity_id: '' });

function pending(item) {
    return Math.max(0, Number(item.total_amount) - (item.allocations || []).reduce((sum, a) => sum + Number(a.amount), 0));
}

export default function MovementManager({ initialAccountId = '', initialActivityId = '' }) {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['accounts', 'activities', 'movements']);
    const [form, setForm] = useState(() => fresh(initialAccountId));
    const [transfer, setTransfer] = useState({ from_account_id: '', to_account_id: '', date: todayKey(), amount: '', description: 'Transferencia entre cuentas' });
    const [accountFilter, setAccountFilter] = useState(initialAccountId);
    const [linkingId, setLinkingId] = useState(null);
    const [linkActivityId, setLinkActivityId] = useState('');
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);
    const prefilledActivity = useRef(false);
    const accounts = useMemo(() => data.accounts || [], [data.accounts]);
    const activities = useMemo(() => (data.activities || []).filter(item => pending(item) > 0), [data.activities]);
    const movements = useMemo(() => (data.movements || []).filter(item => !accountFilter || String(item.account_id) === String(accountFilter)), [data.movements, accountFilter]);
    useEffect(() => {
        if (accounts.length && !form.account_id) {
            const timer = setTimeout(() => setForm(current => ({ ...current, account_id: String(accounts[0].id) })), 0);
            return () => clearTimeout(timer);
        }
    }, [accounts, form.account_id]);
    useEffect(() => {
        if (prefilledActivity.current || !initialActivityId || !activities.length) return;
        const item = activities.find(a => String(a.id) === String(initialActivityId));
        if (!item) return;
        prefilledActivity.current = true;
        const timer = setTimeout(() => setForm(current => ({ ...current, activity_id: String(item.id), direction: item.direction === 'INCOME' ? 'IN' : 'OUT', amount: pending(item).toFixed(2), description: item.description })), 0);
        return () => clearTimeout(timer);
    }, [initialActivityId, activities]);

    const submit = async event => {
        event.preventDefault(); setSaving(true); setMessage(''); setSuccess('');
        try {
            const payload = { ...form, allocations: form.activity_id ? [{ activity_id: Number(form.activity_id), amount: form.amount }] : [] };
            await businessRequest(`/api/businesses/${businessId}/movements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            setForm(fresh(form.account_id)); await refresh(); setSuccess('Movimiento guardado.');
        } catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const submitTransfer = async event => {
        event.preventDefault(); setSaving(true); setMessage(''); setSuccess('');
        try {
            await businessRequest(`/api/businesses/${businessId}/movements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...transfer, flow_type: 'TRANSFER' }) });
            setTransfer({ from_account_id: '', to_account_id: '', date: todayKey(), amount: '', description: 'Transferencia entre cuentas' });
            await refresh(); setSuccess('Transferencia registrada en ambas cuentas.');
        } catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const link = async movement => {
        const item = activities.find(a => String(a.id) === linkActivityId);
        if (!item) return;
        const amount = Math.min(Math.abs(Number(movement.amount)), pending(item));
        try {
            await businessRequest(`/api/businesses/${businessId}/movements`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: movement.id, allocations: [{ activity_id: item.id, amount: amount.toFixed(2) }] }) });
            setLinkingId(null); setLinkActivityId(''); await refresh(); setSuccess('Movimiento vinculado.');
        } catch (cause) { setMessage(cause.message); }
    };
    const remove = async movement => {
        if (!window.confirm('¿Eliminar este movimiento?')) return;
        try { await businessRequest(`/api/businesses/${businessId}/movements?id=${movement.id}`, { method: 'DELETE' }); await refresh(); setSuccess('Movimiento eliminado.'); }
        catch (cause) { setMessage(cause.message); }
    };

    const candidates = (direction) => activities.filter(item => (item.direction === 'INCOME') === (direction === 'IN'));
    return <div className="page-container business-page">
        <PageHeader title="Movimientos" subtitle="Dinero que ha entrado o salido realmente de banco y caja" />
        {message && <div className="alert alert-danger" role="alert">{message}</div>}{success && <div className="alert alert-success" role="status">{success}</div>}
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && <>
            {!accounts.length && <div className="alert alert-warning">Crea una cuenta antes de registrar movimientos.</div>}
            <div className="card business-form-card"><div className="card-header"><h2>Registrar cobro o pago</h2></div><div className="card-body"><form onSubmit={submit} className="business-form-grid">
                <div className="form-group"><label className="form-label" htmlFor="movementAccount">Cuenta</label><select id="movementAccount" className="form-input form-select" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} required><option value="">Elige cuenta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label" htmlFor="movementDate">Fecha</label><input id="movementDate" type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="movementDirection">Sentido</label><select id="movementDirection" className="form-input form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value, activity_id: '' })}><option value="IN">Entrada / cobro</option><option value="OUT">Salida / pago</option></select></div>
                <div className="form-group"><label className="form-label" htmlFor="movementAmount">Importe</label><input id="movementAmount" type="number" min="0.01" step="0.01" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="flowType">Tipo de flujo</label><select id="flowType" className="form-input form-select" value={form.flow_type} onChange={e => setForm({ ...form, flow_type: e.target.value })}><option value="OPERATING">Actividad</option><option value="INVESTING">Inversión</option><option value="FINANCING">Financiación</option><option value="TAX">Impuestos</option><option value="OTHER">Otro</option></select></div>
                <div className="form-group"><label className="form-label" htmlFor="activityLink">Vincular a pendiente</label><select id="activityLink" className="form-input form-select" value={form.activity_id} onChange={e => { const item = activities.find(a => String(a.id) === e.target.value); setForm({ ...form, activity_id: e.target.value, amount: item ? Math.min(pending(item), Number(form.amount) || pending(item)).toFixed(2) : form.amount, description: item ? item.description : form.description }); }}><option value="">Sin vincular</option>{candidates(form.direction).map(item => <option key={item.id} value={item.id}>{item.description} · {euro(pending(item))}</option>)}</select></div>
                <div className="form-group business-full"><label className="form-label" htmlFor="movementDescription">Concepto</label><input id="movementDescription" className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={240} required /></div>
                <button className="btn btn-primary business-full" disabled={saving || !accounts.length}>{saving ? 'Guardando...' : 'Registrar movimiento'}</button>
            </form></div></div>
            {accounts.length > 1 && <div className="card business-form-card"><div className="card-header"><h2>Transferencia entre cuentas</h2></div><div className="card-body"><form onSubmit={submitTransfer} className="business-form-grid">
                <div className="form-group"><label className="form-label" htmlFor="transferFrom">Desde</label><select id="transferFrom" className="form-input form-select" value={transfer.from_account_id} onChange={e => setTransfer({ ...transfer, from_account_id: e.target.value })} required><option value="">Elige cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label" htmlFor="transferTo">Hacia</label><select id="transferTo" className="form-input form-select" value={transfer.to_account_id} onChange={e => setTransfer({ ...transfer, to_account_id: e.target.value })} required><option value="">Elige cuenta</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label" htmlFor="transferDate">Fecha</label><input id="transferDate" type="date" className="form-input" value={transfer.date} onChange={e => setTransfer({ ...transfer, date: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="transferAmount">Importe</label><input id="transferAmount" type="number" min="0.01" step="0.01" className="form-input" value={transfer.amount} onChange={e => setTransfer({ ...transfer, amount: e.target.value })} required /></div>
                <div className="form-group business-full"><label className="form-label" htmlFor="transferDescription">Concepto</label><input id="transferDescription" className="form-input" value={transfer.description} onChange={e => setTransfer({ ...transfer, description: e.target.value })} maxLength={240} required /></div>
                <button className="btn btn-secondary business-full" disabled={saving}>Registrar transferencia</button>
            </form></div></div>}
            <div className="business-section-head"><h2>Historial</h2><select className="form-input form-select business-filter" value={accountFilter} onChange={e => setAccountFilter(e.target.value)} aria-label="Filtrar por cuenta"><option value="">Todas las cuentas</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            {movements.length ? <div className="business-record-list">{movements.map(movement => <div className="card" key={movement.id}><div className="card-body business-record"><div className="business-record-main"><strong>{movement.description}</strong><span>{movement.account.name} · {shortDate(movement.date)} · {movement.flow_type === 'TRANSFER' ? 'Transferencia' : movement.flow_type === 'OPERATING' ? 'Actividad' : movement.flow_type === 'INVESTING' ? 'Inversión' : movement.flow_type === 'FINANCING' ? 'Financiación' : movement.flow_type === 'TAX' ? 'Impuestos' : 'Otro'}</span>{movement.allocations.length > 0 && <span>Vinculado a {movement.allocations.map(a => a.activity.description).join(', ')}</span>}</div><div className="business-record-side"><strong className={Number(movement.amount) < 0 ? 'business-negative' : 'business-positive'}>{euro(movement.amount)}</strong><div className="business-record-actions">{movement.flow_type !== 'TRANSFER' && !movement.allocations.length && <button className="btn btn-secondary" onClick={() => { setLinkingId(movement.id); setLinkActivityId(''); }}>Vincular</button>}<button className="btn btn-secondary" onClick={() => remove(movement)}>Eliminar</button></div></div>
                    {linkingId === movement.id && <div className="business-full business-inline-link"><select className="form-input form-select" value={linkActivityId} onChange={e => setLinkActivityId(e.target.value)} aria-label="Pendiente para vincular"><option value="">Elige pendiente</option>{candidates(Number(movement.amount) > 0 ? 'IN' : 'OUT').map(a => <option key={a.id} value={a.id}>{a.description} · {euro(pending(a))}</option>)}</select><button className="btn btn-primary" disabled={!linkActivityId} onClick={() => link(movement)}>Vincular</button><button className="btn btn-secondary" onClick={() => setLinkingId(null)}>Cancelar</button></div>}
                </div></div>)}</div> : <EmptyState text="Todavía no hay movimientos en esta selección." />}
        </>}
    </div>;
}
