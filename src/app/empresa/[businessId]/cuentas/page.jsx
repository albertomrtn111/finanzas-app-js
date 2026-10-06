'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { euro, shortDate, todayKey, businessRequest, PageHeader, LoadState, EmptyState, useBusinessData } from '@/components/business/ui';

const empty = () => ({ name: '', kind: 'BANK', opening_balance: '0', opening_on: todayKey() });

export default function BusinessAccountsPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['accounts']);
    const [form, setForm] = useState(empty);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const base = `/empresa/${businessId}`;
    const submit = async event => {
        event.preventDefault();
        setSaving(true); setMessage('');
        try {
            await businessRequest(`/api/businesses/${businessId}/accounts`, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
            setForm(empty());
            setEditingId(null);
            await refresh();
        } catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const edit = account => { setEditingId(account.id); setForm({ name: account.name, kind: account.kind, opening_balance: account.opening_balance, opening_on: account.opening_on.slice(0, 10) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const remove = async account => {
        if (!window.confirm(`¿Eliminar la cuenta «${account.name}»?`)) return;
        try { await businessRequest(`/api/businesses/${businessId}/accounts?id=${account.id}`, { method: 'DELETE' }); await refresh(); }
        catch (cause) { setMessage(cause.message); }
    };
    return <div className="page-container business-page">
        <PageHeader title="Cuentas" subtitle="Bancos y caja con su saldo inicial y sus movimientos" />
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && <div className="business-account-grid business-spaced">{data.accounts?.length ? data.accounts.map(account => <div className="card" key={account.id}><div className="card-body business-list"><div className="business-line"><strong>{account.name}</strong><span>{account.kind === 'CASH' ? 'Caja' : 'Banco'}</span></div><span className="business-account-balance">{euro(account.balance)}</span><small>Saldo inicial {euro(account.opening_balance)} · {shortDate(account.opening_on)}</small><Link href={`${base}/movimientos?accountId=${account.id}`}>Ver movimientos →</Link><div className="business-record-actions"><button className="btn btn-secondary" onClick={() => edit(account)}>Editar</button>{!account.movement_count && <button className="btn btn-secondary" onClick={() => remove(account)}>Eliminar</button>}</div></div></div>) : <EmptyState text="Todavía no hay cuentas. Crea una con el saldo disponible en la fecha inicial." />}</div>}
        <div className="card business-form-card"><div className="card-header"><h2>{editingId ? 'Editar cuenta' : 'Añadir cuenta'}</h2></div><div className="card-body"><form onSubmit={submit} className="business-form-grid">
            <div className="form-group"><label className="form-label" htmlFor="accountName">Nombre</label><input id="accountName" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} placeholder="Ej. Banco principal" required /></div>
            <div className="form-group"><label className="form-label" htmlFor="accountKind">Tipo</label><select id="accountKind" className="form-input form-select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="BANK">Banco</option><option value="CASH">Caja</option></select></div>
            <div className="form-group"><label className="form-label" htmlFor="openingBalance">Saldo inicial</label><input id="openingBalance" type="number" step="0.01" className="form-input" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} required /></div>
            <div className="form-group"><label className="form-label" htmlFor="openingOn">Fecha del saldo</label><input id="openingOn" type="date" className="form-input" value={form.opening_on} onChange={e => setForm({ ...form, opening_on: e.target.value })} required /></div>
            {message && <div role="alert" className="alert alert-danger business-full">{message}</div>}
            <div className="business-full business-form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Añadir cuenta'}</button>{editingId && <button type="button" className="btn btn-secondary" onClick={() => { setEditingId(null); setForm(empty()); }}>Cancelar</button>}</div>
        </form></div></div>
    </div>;
}
