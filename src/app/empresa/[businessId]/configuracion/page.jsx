'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { businessRequest, PageHeader, LoadState, useBusinessData } from '@/components/business/ui';

export default function BusinessSettingsPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['business']);
    const [form, setForm] = useState({ name: '', legal_name: '', tax_id: '', kind: 'SELF_EMPLOYED', vat_regime: 'GENERAL' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => {
        if (data.business) {
            const timer = setTimeout(() => setForm({ name: data.business.name || '', legal_name: data.business.legal_name || '', tax_id: data.business.tax_id || '', kind: data.business.kind, vat_regime: data.business.vat_regime }), 0);
            return () => clearTimeout(timer);
        }
    }, [data]);
    const submit = async event => {
        event.preventDefault(); setSaving(true); setMessage('');
        try { await businessRequest(`/api/businesses/${businessId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); await refresh(); setMessage('Datos guardados.'); }
        catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    return <div className="page-container business-page"><PageHeader title="Configuración de empresa" subtitle="Datos del negocio usados para organizar tu espacio financiero" />
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && <div className="card business-form-card"><div className="card-header"><h2>Datos del negocio</h2></div><div className="card-body"><form onSubmit={submit} className="business-form-grid">
            <div className="form-group"><label className="form-label" htmlFor="businessName">Nombre visible</label><input id="businessName" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} required /></div>
            <div className="form-group"><label className="form-label" htmlFor="legalName">Nombre fiscal / razón social</label><input id="legalName" className="form-input" value={form.legal_name} onChange={e => setForm({ ...form, legal_name: e.target.value })} maxLength={160} /></div>
            <div className="form-group"><label className="form-label" htmlFor="taxId">NIF</label><input id="taxId" className="form-input" value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} maxLength={32} /></div>
            <div className="form-group"><label className="form-label" htmlFor="kind">Tipo de negocio</label><select id="kind" className="form-input form-select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="SELF_EMPLOYED">Autónomo</option><option value="COMPANY">Sociedad</option></select></div>
            <div className="form-group business-full"><label className="form-label" htmlFor="vatRegime">Régimen de IVA</label><select id="vatRegime" className="form-input form-select" value={form.vat_regime} onChange={e => setForm({ ...form, vat_regime: e.target.value })}><option value="GENERAL">Régimen general</option></select><small>El resumen de IVA está preparado para el régimen general. Otros regímenes requieren reglas específicas.</small></div>
            {message && <div className="alert alert-success business-full" role="status">{message}</div>}
            <button className="btn btn-primary business-full" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        </form></div></div>}
    </div>;
}
