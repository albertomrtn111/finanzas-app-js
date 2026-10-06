'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { activityInput } from '@/lib/business';
import { euro, shortDate, dateInput, todayKey, businessRequest, PageHeader, LoadState, EmptyState, useBusinessData } from './ui';

const newLine = () => ({ base: '', vat_treatment: 'DOMESTIC', vat_rate: 0, deductible_percent: 100 });
const initial = (invoicesOnly = false) => ({
    direction: 'EXPENSE', description: '', category: '', occurred_on: todayKey(), due_on: '',
    counterparty_name: '', counterparty_tax_id: '', document_kind: invoicesOnly ? 'INVOICE' : 'NONE',
    document_number: '', document_date: invoicesOnly ? todayKey() : '', vat_period: '',
    withholding_rate: 0, tax_lines: [newLine()]
});

function pendingAmount(item) {
    const allocated = (item.allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    return Math.max(0, Number(item.total_amount) - allocated);
}

export default function ActivityManager({ view = 'all' }) {
    const { businessId } = useParams();
    const invoicesOnly = view === 'invoices';
    const { data, loading, error, refresh } = useBusinessData(businessId, ['activities']);
    const [form, setForm] = useState(() => initial(invoicesOnly));
    const [editingId, setEditingId] = useState(null);
    const [file, setFile] = useState(null);
    const [directionFilter, setDirectionFilter] = useState('ALL');
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);
    const base = `/empresa/${businessId}`;

    const rows = useMemo(() => (data.activities || []).filter(item =>
        (directionFilter === 'ALL' || item.direction === directionFilter) &&
        (view !== 'invoices' || item.document_kind !== 'NONE') &&
        (view !== 'pending' || pendingAmount(item) > 0)
    ), [data.activities, directionFilter, view]);
    const preview = activityInput(form);

    const changeLine = (index, key, value) => setForm(current => ({ ...current, tax_lines: current.tax_lines.map((line, i) => i === index ? { ...line, [key]: value } : line) }));
    const reset = () => { setEditingId(null); setForm(initial(invoicesOnly)); setFile(null); };
    const edit = item => {
        setEditingId(item.id);
        setForm({
            direction: item.direction, description: item.description, category: item.category,
            occurred_on: dateInput(item.occurred_on), due_on: dateInput(item.due_on),
            counterparty_name: item.counterparty_name || '', counterparty_tax_id: item.counterparty_tax_id || '',
            document_kind: item.document_kind, document_number: item.document_number || '',
            document_date: dateInput(item.document_date), vat_period: item.vat_period || '',
            withholding_rate: Number(item.base_amount) ? Math.round(Number(item.withholding_amount) / Number(item.base_amount) * 10000) / 100 : 0,
            tax_lines: Array.isArray(item.tax_lines) ? item.tax_lines.map(line => ({ base: line.base, vat_treatment: line.vat_treatment || 'DOMESTIC', vat_rate: line.vat_rate, deductible_percent: line.deductible_percent })) : [newLine()]
        });
        setFile(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const submit = async event => {
        event.preventDefault();
        setMessage(''); setSuccess(''); setSaving(true);
        const parsed = activityInput(form);
        if (parsed.error) { setMessage(parsed.error); setSaving(false); return; }
        try {
            const activity = await businessRequest(`/api/businesses/${businessId}/activities`, { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { ...form, id: editingId } : form) });
            let uploadWarning = '';
            if (file) {
                const upload = new FormData(); upload.append('activityId', String(activity.id)); upload.append('file', file);
                try { await businessRequest(`/api/businesses/${businessId}/attachments`, { method: 'POST', body: upload }); }
                catch (cause) { uploadWarning = ` La operación se guardó, pero el archivo no: ${cause.message}`; }
            }
            reset(); await refresh(); setSuccess(`Operación guardada.${uploadWarning}`);
        } catch (cause) { setMessage(cause.message); }
        finally { setSaving(false); }
    };
    const remove = async item => {
        if (!window.confirm(`¿Eliminar «${item.description}»?`)) return;
        setMessage(''); setSuccess('');
        try { await businessRequest(`/api/businesses/${businessId}/activities?id=${item.id}`, { method: 'DELETE' }); await refresh(); setSuccess('Operación eliminada.'); }
        catch (cause) { setMessage(cause.message); }
    };

    const title = view === 'invoices' ? 'Facturas registradas' : view === 'pending' ? 'Por cobrar y pagar' : 'Ingresos y gastos';
    const subtitle = view === 'invoices' ? 'Control de facturas creadas o recibidas fuera de esta aplicación' : view === 'pending' ? 'Obligaciones abiertas y sus vencimientos' : 'Hechos económicos por fecha de devengo, pagados o pendientes';
    return <div className="page-container business-page">
        <PageHeader title={title} subtitle={subtitle} />
        <div className="card business-form-card"><div className="card-header"><h2>{editingId ? 'Editar operación' : view === 'invoices' ? 'Registrar factura existente' : 'Registrar ingreso o gasto incurrido'}</h2></div><div className="card-body">
            <form onSubmit={submit} className="business-form-grid">
                <div className="form-group"><label className="form-label" htmlFor="activityDirection">Tipo</label><select id="activityDirection" className="form-input form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option></select></div>
                <div className="form-group"><label className="form-label" htmlFor="activityCategory">Categoría</label><input id="activityCategory" className="form-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} maxLength={100} placeholder="Ej. Servicios profesionales" required /></div>
                <div className="form-group business-full"><label className="form-label" htmlFor="activityDescription">Concepto</label><input id="activityDescription" className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={240} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="occurredOn">Fecha de devengo</label><input id="occurredOn" type="date" className="form-input" value={form.occurred_on} onChange={e => setForm({ ...form, occurred_on: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label" htmlFor="dueOn">Vencimiento</label><input id="dueOn" type="date" className="form-input" value={form.due_on} onChange={e => setForm({ ...form, due_on: e.target.value })} /></div>
                <div className="form-group"><label className="form-label" htmlFor="documentKind">Documento</label><select id="documentKind" className="form-input form-select" value={form.document_kind} onChange={e => setForm({ ...form, document_kind: e.target.value, document_date: e.target.value === 'NONE' ? '' : (form.document_date || todayKey()), document_number: e.target.value === 'NONE' ? '' : form.document_number, tax_lines: e.target.value === 'NONE' ? form.tax_lines.map(line => ({ ...line, vat_rate: 0 })) : form.tax_lines })}>{!invoicesOnly && <option value="NONE">Pendiente de factura / sin factura</option>}<option value="INVOICE">Factura existente</option></select></div>
                <div className="form-group"><label className="form-label" htmlFor="counterparty">Cliente o proveedor</label><input id="counterparty" className="form-input" value={form.counterparty_name} onChange={e => setForm({ ...form, counterparty_name: e.target.value })} maxLength={160} required={form.document_kind !== 'NONE'} /></div>
                {form.document_kind !== 'NONE' && <>
                    <div className="form-group"><label className="form-label" htmlFor="documentNumber">Número de factura</label><input id="documentNumber" className="form-input" value={form.document_number} onChange={e => setForm({ ...form, document_number: e.target.value })} maxLength={80} required /></div>
                    <div className="form-group"><label className="form-label" htmlFor="documentDate">Fecha de factura</label><input id="documentDate" type="date" className="form-input" value={form.document_date} onChange={e => setForm({ ...form, document_date: e.target.value })} required /></div>
                    <div className="form-group"><label className="form-label" htmlFor="counterpartyTaxId">NIF del cliente o proveedor</label><input id="counterpartyTaxId" className="form-input" value={form.counterparty_tax_id} onChange={e => setForm({ ...form, counterparty_tax_id: e.target.value })} maxLength={32} /></div>
                    <div className="form-group"><label className="form-label" htmlFor="vatPeriod">Período de IVA</label><input id="vatPeriod" className="form-input" value={form.vat_period} onChange={e => setForm({ ...form, vat_period: e.target.value })} placeholder="Automático según fecha; o 2026-Q4" pattern="[0-9]{4}-Q[1-4]" /></div>
                </>}
                <div className="business-full business-tax-lines"><div className="business-line"><h3>Importes</h3><button type="button" className="btn btn-secondary" onClick={() => setForm({ ...form, tax_lines: [...form.tax_lines, newLine()] })} disabled={form.tax_lines.length >= 20}>Añadir línea</button></div>
                    {form.tax_lines.map((line, index) => <div className="business-tax-line" key={index}>
                        <div className="form-group"><label className="form-label" htmlFor={`base-${index}`}>Base imponible</label><input id={`base-${index}`} type="number" min="0.01" step="0.01" className="form-input" value={line.base} onChange={e => changeLine(index, 'base', e.target.value)} required /></div>
                        <div className="form-group"><label className="form-label" htmlFor={`treatment-${index}`}>Clasificación IVA</label><select id={`treatment-${index}`} className="form-input form-select" value={line.vat_treatment} onChange={e => setForm(current => ({ ...current, tax_lines: current.tax_lines.map((existing, i) => i === index ? { ...existing, vat_treatment: e.target.value, vat_rate: e.target.value === 'DOMESTIC' ? existing.vat_rate : 0 } : existing) }))} disabled={form.document_kind === 'NONE'}><option value="DOMESTIC">Interior</option><option value="EXEMPT">Exenta</option><option value="NON_SUBJECT">No sujeta</option></select></div>
                        <div className="form-group"><label className="form-label" htmlFor={`vat-${index}`}>IVA %</label><input id={`vat-${index}`} type="number" min="0" max="100" step="0.01" className="form-input" value={line.vat_rate} onChange={e => changeLine(index, 'vat_rate', e.target.value)} disabled={form.document_kind === 'NONE' || line.vat_treatment !== 'DOMESTIC'} required /></div>
                        {form.direction === 'EXPENSE' && <div className="form-group"><label className="form-label" htmlFor={`deduction-${index}`}>IVA deducible %</label><input id={`deduction-${index}`} type="number" min="0" max="100" step="0.01" className="form-input" value={line.deductible_percent} onChange={e => changeLine(index, 'deductible_percent', e.target.value)} disabled={form.document_kind === 'NONE'} required /></div>}
                        {form.tax_lines.length > 1 && <button type="button" className="btn btn-secondary business-remove-line" onClick={() => setForm({ ...form, tax_lines: form.tax_lines.filter((_, i) => i !== index) })} aria-label={`Quitar línea ${index + 1}`}>Quitar</button>}
                    </div>)}
                </div>
                <div className="form-group"><label className="form-label" htmlFor="withholding">Retención %</label><input id="withholding" type="number" min="0" max="100" step="0.01" className="form-input" value={form.withholding_rate} onChange={e => setForm({ ...form, withholding_rate: e.target.value })} /></div>
                <div className="form-group"><label className="form-label" htmlFor="file">Adjuntar factura o justificante</label><input id="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="form-input" onChange={e => setFile(e.target.files?.[0] || null)} /><small>PDF o imagen, máximo 5 MB.</small></div>
                {!preview.error && <div className="business-full business-total-preview">Base {euro(preview.value.base_amount)} · IVA {euro(preview.value.vat_amount)} · Total {euro(preview.value.total_amount)}</div>}
                {message && <div className="alert alert-danger business-full" role="alert">{message}</div>}
                {success && <div className="alert alert-success business-full" role="status">{success}</div>}
                <div className="business-full business-form-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Registrar operación'}</button>{editingId && <button className="btn btn-secondary" type="button" onClick={reset}>Cancelar</button>}</div>
            </form>
        </div></div>
        <div className="business-section-head"><h2>{view === 'pending' ? 'Pendientes' : 'Operaciones registradas'}</h2><select className="form-input form-select business-filter" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)} aria-label="Filtrar por tipo"><option value="ALL">Todos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Gastos</option></select></div>
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && (rows.length ? <div className="business-record-list">{rows.map(item => {
            const pending = pendingAmount(item);
            return <div className="card" key={item.id}><div className="card-body business-record"><div className="business-record-main"><div className="business-line"><strong>{item.description}</strong><span className={`business-badge ${item.direction === 'INCOME' ? 'income' : 'expense'}`}>{item.direction === 'INCOME' ? 'Ingreso' : 'Gasto'}</span></div><span>{item.category} · {shortDate(item.occurred_on)}{item.counterparty_name ? ` · ${item.counterparty_name}` : ''}</span><span>{item.document_number ? `Factura ${item.document_number}` : 'Sin factura registrada'}{item.due_on ? ` · Vence ${shortDate(item.due_on)}` : ''}</span><div className="business-attachment-links">{item.attachments?.map(file => <a key={file.id} href={`/api/businesses/${businessId}/attachments?id=${file.id}`}>📎 {file.filename}</a>)}</div></div><div className="business-record-side"><strong>{euro(item.total_amount)}</strong><span>{pending > 0 ? `Pendiente ${euro(pending)}` : 'Cobrado / pagado'}</span><div className="business-record-actions"><button className="btn btn-secondary" onClick={() => edit(item)}>Editar</button>{pending > 0 && <Link className="btn btn-secondary" href={`${base}/movimientos?activityId=${item.id}`}>{item.direction === 'INCOME' ? 'Cobrar' : 'Pagar'}</Link>}<button className="btn btn-secondary" onClick={() => remove(item)}>Eliminar</button></div></div></div></div>;
        })}</div> : <EmptyState text="No hay operaciones que coincidan con este filtro." />)}
    </div>;
}
