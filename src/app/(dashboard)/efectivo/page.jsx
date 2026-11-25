'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { localDateKey } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateFormat';
import { formatPct } from '@/lib/moneyFormat';
import { parseAmountInput, amountToInput } from '@/lib/amount';
import { latestByAccount, totalLatestValue } from '@/lib/financialSnapshots';
import { changeFromPrevious, jsonRequest, requestJson } from '@/lib/utils';
import { AmountInput, EmptyState, Field, LoadState, Money, useFeedback } from '@/components/ui';

const emptyForm = account => ({ date: localDateKey(), account, current_value: '', notes: '' });

// Lleva el formulario a la vista y pone el foco en el saldo (sin animación si el usuario la ha reducido).
function focusForm() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('efectivo-formulario')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('efectivo-saldo')?.focus({ preventScroll: true });
}

export default function EfectivoPage() {
    const { toast, confirm } = useFeedback();
    const [snapshots, setSnapshots] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(() => emptyForm(''));
    const [errors, setErrors] = useState({});

    // silent: actualiza los datos sin sustituir la página por la carga (después de guardar).
    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            const [cashData, investmentData] = await Promise.all([requestJson('/api/cash'), requestJson('/api/investments')]);
            const cash = Array.isArray(cashData) ? cashData : [];
            setSnapshots(cash);
            setInvestments(Array.isArray(investmentData) ? investmentData : []);
            if (cash.length) setForm(current => (current.account ? current : { ...current, account: cash[0].account }));
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

    const updateForm = (field, value) => {
        setForm(current => ({ ...current, [field]: value }));
        setErrors(current => ({ ...current, [field]: undefined }));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setErrors({});
        setForm(emptyForm(snapshots[0]?.account || ''));
    };

    const handleEdit = (snapshot) => {
        setEditingId(snapshot.id);
        setErrors({});
        setForm({
            date: String(snapshot.date).slice(0, 10),
            account: snapshot.account,
            current_value: amountToInput(snapshot.current_value),
            notes: snapshot.notes || '',
        });
        setTimeout(focusForm, 0);
    };

    // Último saldo de cada cuenta
    const cashByAccount = useMemo(() => latestByAccount(snapshots), [snapshots]);
    const totalCash = useMemo(() => totalLatestValue(snapshots), [snapshots]);

    // Saldo total al cierre del mes anterior, para la variación
    const previousMonthCash = useMemo(() => {
        const now = new Date();
        return totalLatestValue(snapshots, localDateKey(new Date(now.getFullYear(), now.getMonth(), 0)));
    }, [snapshots]);
    const cashVariation = previousMonthCash > 0 ? ((totalCash - previousMonthCash) / previousMonthCash) * 100 : null;

    const totalInvestments = useMemo(() => totalLatestValue(investments), [investments]);
    const totalPatrimonio = totalCash + totalInvestments;
    const cashPercentage = totalPatrimonio > 0 ? (totalCash / totalPatrimonio) * 100 : 0;

    // Variación de cada saldo respecto al anterior de su cuenta: se calcula una vez por cada carga.
    const changes = useMemo(() => changeFromPrevious(snapshots), [snapshots]);
    const uniqueAccounts = useMemo(() => [...new Set(snapshots.map(s => s.account))], [snapshots]);

    const parsedValue = parseAmountInput(form.current_value, { allowNegative: true, allowZero: true, label: 'El saldo' });

    // Vista previa del cambio de liquidez (solo al registrar un saldo nuevo)
    let liquidityPreview = null;
    if (!editingId && form.account && !parsedValue.error) {
        const currentValue = Number(cashByAccount[form.account]?.current_value || 0);
        const newValue = Number(parsedValue.value);
        liquidityPreview = { currentValue, newValue, diff: newValue - currentValue };
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nextErrors = {};
        if (!form.account.trim()) nextErrors.account = 'Indica la cuenta';
        if (parsedValue.error) nextErrors.current_value = parsedValue.error;
        if (!form.date) nextErrors.date = 'Indica la fecha';
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            document.getElementById(nextErrors.date ? 'efectivo-fecha' : nextErrors.account ? 'efectivo-cuenta' : 'efectivo-saldo')?.focus();
            return;
        }

        setSaving(true);
        try {
            const body = { date: form.date, account: form.account.trim(), current_value: parsedValue.value, notes: form.notes };
            await requestJson('/api/cash', jsonRequest(editingId ? 'PUT' : 'POST', editingId ? { ...body, id: editingId } : body));
            toast({ text: editingId ? 'Saldo actualizado' : `Saldo de ${body.account} guardado` });
            setEditingId(null);
            setForm(emptyForm(body.account));
            await loadData({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (snapshot) => {
        const ok = await confirm({
            title: 'Eliminar saldo',
            text: `Se eliminará el saldo de ${snapshot.account} del ${formatDate(snapshot.date)}. No se puede deshacer.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            await requestJson(`/api/cash?id=${snapshot.id}`, { method: 'DELETE' });
            setSnapshots(list => list.filter(s => s.id !== snapshot.id));
            if (editingId === snapshot.id) cancelEdit();
            toast({ text: 'Saldo eliminado' });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Efectivo</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={() => loadData()} label="Cargando tus saldos…" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Efectivo</h1>
                <p className="page-subtitle">Apunta el saldo de tus cuentas bancarias; con un saldo al mes basta para seguir tu liquidez.</p>
            </div>

            <div className="kpi-grid mb-lg">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Total efectivo actual</div>
                    <div className="kpi-value kpi-accent"><Money value={totalCash} /></div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Variación frente al mes anterior</div>
                    <div className="kpi-value"><Money value={totalCash - previousMonthCash} signed /></div>
                    {cashVariation !== null && (
                        <div className="kpi-trend">
                            <span className={cashVariation >= 0 ? 'text-success' : 'text-danger'}>
                                {cashVariation > 0 ? `Sube un ${formatPct(cashVariation)}` : cashVariation < 0 ? `Baja un ${formatPct(-cashVariation)}` : 'Sin cambios'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Parte de tu patrimonio</div>
                    <div className="kpi-value">{formatPct(cashPercentage)}</div>
                    <div className="kpi-trend text-muted text-sm">
                        {cashPercentage > 30 ? 'Liquidez alta' : cashPercentage < 10 ? 'Liquidez baja' : 'Equilibrado'}
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Cuentas con saldo</div>
                    <div className="kpi-value">{Object.keys(cashByAccount).length}</div>
                </div>
            </div>

            <div className="grid grid-2 gap-lg">
                <section className="card" id="efectivo-formulario" aria-labelledby="efectivo-formulario-titulo">
                    <div className="card-header">
                        <h2 id="efectivo-formulario-titulo">{editingId ? 'Editar saldo' : 'Nuevo saldo'}</h2>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="grid grid-2 gap-md">
                                <Field label="Fecha" htmlFor="efectivo-fecha" error={errors.date}>
                                    <input
                                        id="efectivo-fecha"
                                        type="date"
                                        className="form-input"
                                        value={form.date}
                                        onChange={(e) => updateForm('date', e.target.value)}
                                        aria-invalid={Boolean(errors.date)}
                                        aria-describedby={errors.date ? 'efectivo-fecha-error' : undefined}
                                        required
                                    />
                                </Field>
                                <Field label="Cuenta" htmlFor="efectivo-cuenta" error={errors.account}>
                                    <input
                                        id="efectivo-cuenta"
                                        type="text"
                                        className="form-input"
                                        placeholder="Por ejemplo, CaixaBank"
                                        list="efectivo-cuentas"
                                        maxLength={150}
                                        value={form.account}
                                        onChange={(e) => updateForm('account', e.target.value)}
                                        aria-invalid={Boolean(errors.account)}
                                        aria-describedby={errors.account ? 'efectivo-cuenta-error' : undefined}
                                        required
                                    />
                                    <datalist id="efectivo-cuentas">
                                        {uniqueAccounts.map((account) => <option key={account} value={account} />)}
                                    </datalist>
                                </Field>
                            </div>
                            <Field label="Saldo (€)" htmlFor="efectivo-saldo" hint="Puede ser negativo si la cuenta está en descubierto." error={errors.current_value}>
                                <AmountInput
                                    id="efectivo-saldo"
                                    value={form.current_value}
                                    onChange={(value) => updateForm('current_value', value)}
                                    aria-invalid={Boolean(errors.current_value)}
                                    aria-describedby={errors.current_value ? 'efectivo-saldo-error' : 'efectivo-saldo-ayuda'}
                                    required
                                />
                            </Field>

                            {liquidityPreview && liquidityPreview.diff !== 0 && (
                                <div className={`smart-alert mb-md ${liquidityPreview.diff >= 0 ? 'success' : 'warning'}`}>
                                    <div className="smart-alert-content">
                                        <div className="smart-alert-title">Tu liquidez en esta cuenta cambiará</div>
                                        <div className="smart-alert-desc">
                                            De <Money value={liquidityPreview.currentValue} /> a <Money value={liquidityPreview.newValue} /> (<Money value={liquidityPreview.diff} signed />)
                                        </div>
                                    </div>
                                </div>
                            )}

                            <Field label="Notas (opcional)" htmlFor="efectivo-notas">
                                <textarea
                                    id="efectivo-notas"
                                    className="form-input"
                                    rows="2"
                                    value={form.notes}
                                    onChange={(e) => updateForm('notes', e.target.value)}
                                />
                            </Field>

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando…' : editingId ? 'Actualizar saldo' : 'Guardar saldo'}
                                </button>
                                {editingId && (
                                    <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                                        Cancelar edición
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </section>

                <section className="card" aria-labelledby="efectivo-lista-titulo">
                    <div className="card-header"><h2 id="efectivo-lista-titulo">Últimos saldos</h2></div>
                    <div className="card-body">
                        {snapshots.length === 0 ? (
                            <EmptyState title="Todavía no hay saldos" text="Apunta el saldo de tu cuenta principal para empezar." />
                        ) : (
                            <ul className="record-list record-list-scroll">
                                {snapshots.slice(0, 20).map((s) => {
                                    const change = changes.get(s.id);
                                    const date = formatDate(s.date);
                                    return (
                                        <li key={s.id} className={`record-item ${editingId === s.id ? 'is-editing' : ''}`.trim()}>
                                            <div className="record-item-head">
                                                <span className="font-semibold">{s.account}</span>
                                                <Money value={s.current_value} className="font-semibold" />
                                            </div>
                                            <div className="record-item-meta">
                                                <span>{date}</span>
                                                {change !== undefined && change !== 0 && (
                                                    <span>
                                                        <Money value={change} signed /> <span className="text-muted">frente al anterior</span>
                                                    </span>
                                                )}
                                            </div>
                                            {s.notes && <p className="record-item-note">{s.notes}</p>}
                                            <div className="record-actions">
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEdit(s)} aria-label={`Editar el saldo de ${s.account} del ${date}`}>
                                                    Editar
                                                </button>
                                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(s)} aria-label={`Eliminar el saldo de ${s.account} del ${date}`}>
                                                    Eliminar
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
