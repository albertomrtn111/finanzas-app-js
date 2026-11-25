'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { localDateKey } from '@/lib/dateUtils';
import { formatDate } from '@/lib/dateFormat';
import { formatPct, formatSignedPct } from '@/lib/moneyFormat';
import { parseAmountInput, amountToInput } from '@/lib/amount';
import { latestByAccount, totalLatestValue } from '@/lib/financialSnapshots';
import { jsonRequest, requestJson } from '@/lib/utils';
import { AmountInput, EmptyState, Field, LoadState, Money, useFeedback } from '@/components/ui';

// Tipos de movimiento: aportación (entra dinero), retirada (sale) o solo actualizar el valor (aportación 0).
const MOVEMENTS = {
    entrada: { option: 'Aportación (entra dinero)', amountLabel: 'Importe aportado (€)', saved: 'Aportación guardada' },
    salida: { option: 'Retirada o venta (sale dinero)', amountLabel: 'Importe retirado (€)', saved: 'Retirada guardada' },
    valor: { option: 'Solo actualizar el valor (sin aportar ni retirar)', amountLabel: null, saved: 'Valor actualizado' },
};

const movementOf = contribution => (contribution > 0 ? 'entrada' : contribution < 0 ? 'salida' : 'valor');

const BADGES = {
    entrada: { label: 'Aportación', className: 'badge-success' },
    salida: { label: 'Retirada', className: 'badge-danger' },
    valor: { label: 'Actualización de valor', className: 'badge-primary' },
};

const emptyForm = product => ({
    date: localDateKey(),
    account: product?.name || '',
    asset_type: product?.asset_type || '',
    movType: 'entrada',
    amount: '',
    current_value: '',
    notes: '',
});

function focusForm() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('inversion-formulario')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('inversion-valor')?.focus({ preventScroll: true });
}

export default function InversionesRegistroPage() {
    const { toast, confirm } = useFeedback();
    const [products, setProducts] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(() => emptyForm(null));
    const [errors, setErrors] = useState({});

    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            const [productData, investmentData] = await Promise.all([requestJson('/api/investment-products'), requestJson('/api/investments')]);
            const list = Array.isArray(productData) ? productData : [];
            setProducts(list);
            setInvestments(Array.isArray(investmentData) ? investmentData : []);
            if (list.length) setForm(current => (current.account ? current : { ...current, account: list[0].name, asset_type: list[0].asset_type }));
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

    const handleProductChange = (name) => {
        const product = products.find((p) => p.name === name);
        setForm(current => ({ ...current, account: name, asset_type: product?.asset_type || '' }));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setErrors({});
        setForm(emptyForm(products[0]));
    };

    const handleEdit = (inv) => {
        const contribution = Number(inv.contribution);
        setEditingId(inv.id);
        setErrors({});
        setForm({
            date: String(inv.date).slice(0, 10),
            account: inv.account,
            asset_type: inv.asset_type,
            movType: movementOf(contribution),
            amount: contribution ? amountToInput(Math.abs(contribution)) : '',
            current_value: amountToInput(inv.current_value),
            notes: inv.notes || '',
        });
        setTimeout(focusForm, 0);
    };

    // Situación actual del producto elegido
    const productStats = useMemo(() => {
        const productInvestments = investments.filter(i => i.account === form.account);
        if (!form.account || productInvestments.length === 0) return null;
        const totalContrib = productInvestments.reduce((sum, i) => sum + Number(i.contribution), 0);
        const currentValue = Number(latestByAccount(productInvestments)[form.account]?.current_value || 0);
        const gain = currentValue - totalContrib;
        const returnPct = totalContrib !== 0 ? (gain / totalContrib) * 100 : 0;
        const totalPortfolio = totalLatestValue(investments);
        const weight = totalPortfolio > 0 ? (currentValue / totalPortfolio) * 100 : 0;
        return { totalContrib, currentValue, gain, returnPct, weight, totalPortfolio };
    }, [form.account, investments]);

    const isValueUpdate = form.movType === 'valor';
    const parsedAmount = isValueUpdate ? { value: '0.00' } : parseAmountInput(form.amount, { label: 'El importe' });
    const parsedValue = parseAmountInput(form.current_value, { allowZero: true, label: 'El valor total' });

    // Vista previa del peso en cartera (solo al registrar un movimiento nuevo)
    let impactPreview = null;
    if (productStats && !editingId && !isValueUpdate && !parsedAmount.error) {
        const amount = Number(parsedAmount.value);
        const isEntry = form.movType === 'entrada';
        const newValue = parsedValue.error ? productStats.currentValue + (isEntry ? amount : -amount) : Number(parsedValue.value);
        const newTotalPortfolio = productStats.totalPortfolio - productStats.currentValue + newValue;
        impactPreview = {
            isEntry,
            newValue,
            currentWeight: productStats.weight,
            newWeight: newTotalPortfolio > 0 ? (newValue / newTotalPortfolio) * 100 : 0,
        };
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nextErrors = {};
        if (!form.account) nextErrors.account = 'Elige un producto';
        if (!form.date) nextErrors.date = 'Indica la fecha';
        if (parsedAmount.error) nextErrors.amount = parsedAmount.error;
        if (parsedValue.error) nextErrors.current_value = parsedValue.error;
        setErrors(nextErrors);
        const first = ['account', 'date', 'amount', 'current_value'].find(field => nextErrors[field]);
        if (first) {
            document.getElementById({ account: 'inversion-producto', date: 'inversion-fecha', amount: 'inversion-importe', current_value: 'inversion-valor' }[first])?.focus();
            return;
        }

        const contribution = form.movType === 'salida' ? `-${parsedAmount.value}` : parsedAmount.value;
        const body = {
            date: form.date,
            account: form.account,
            asset_type: form.asset_type,
            contribution,
            current_value: parsedValue.value,
            notes: form.notes,
        };

        setSaving(true);
        try {
            await requestJson('/api/investments', jsonRequest(editingId ? 'PUT' : 'POST', editingId ? { ...body, id: editingId } : body));
            toast({ text: editingId ? 'Movimiento actualizado' : `${MOVEMENTS[form.movType].saved} en ${form.account}` });
            setEditingId(null);
            setErrors({});
            setForm(current => ({ ...emptyForm(null), account: current.account, asset_type: current.asset_type }));
            await loadData({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (inv) => {
        const ok = await confirm({
            title: 'Eliminar movimiento',
            text: `Se eliminará el movimiento de ${inv.account} del ${formatDate(inv.date)}. No se puede deshacer.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            await requestJson(`/api/investments?id=${inv.id}`, { method: 'DELETE' });
            setInvestments(list => list.filter(i => i.id !== inv.id));
            if (editingId === inv.id) cancelEdit();
            toast({ text: 'Movimiento eliminado' });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Registro de inversiones</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={() => loadData()} label="Cargando tus inversiones…" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Registro de inversiones</h1>
                <p className="page-subtitle">Apunta lo que aportas o retiras de cada producto y cuánto vale después.</p>
            </div>

            {products.length === 0 ? (
                <div className="card">
                    <EmptyState
                        title="Todavía no tienes productos de inversión"
                        text="Crea al menos uno (un fondo, un ETF, un plan de pensiones…) para registrar sus movimientos."
                        action={<Link className="btn btn-primary" href="/productos">Crear un producto</Link>}
                    />
                </div>
            ) : (
                <div className="grid grid-2 gap-lg">
                    <section className="card" id="inversion-formulario" aria-labelledby="inversion-formulario-titulo">
                        <div className="card-header">
                            <h2 id="inversion-formulario-titulo">{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSubmit} noValidate>
                                <Field
                                    label="Producto de inversión"
                                    htmlFor="inversion-producto"
                                    hint={editingId ? 'El producto no se puede cambiar al editar.' : form.asset_type ? `Tipo: ${form.asset_type}` : undefined}
                                    error={errors.account}
                                >
                                    <select
                                        id="inversion-producto"
                                        className="form-input form-select"
                                        value={form.account}
                                        onChange={(e) => handleProductChange(e.target.value)}
                                        disabled={Boolean(editingId)}
                                        aria-describedby={errors.account ? 'inversion-producto-error' : 'inversion-producto-ayuda'}
                                    >
                                        {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </Field>

                                {productStats && !editingId && (
                                    <div className="impact-preview mb-md">
                                        <h3 className="impact-preview-title">Situación actual del producto</h3>
                                        <div className="impact-preview-row">
                                            <span>Valor actual</span>
                                            <Money value={productStats.currentValue} className="font-semibold" />
                                        </div>
                                        <div className="impact-preview-row">
                                            <span>Plusvalía</span>
                                            <span><Money value={productStats.gain} signed /> ({formatSignedPct(productStats.returnPct)})</span>
                                        </div>
                                        <div className="impact-preview-row">
                                            <span>Peso en la cartera</span>
                                            <span>{formatPct(productStats.weight)}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-2 gap-md">
                                    <Field label="Fecha" htmlFor="inversion-fecha" error={errors.date}>
                                        <input
                                            id="inversion-fecha"
                                            type="date"
                                            className="form-input"
                                            value={form.date}
                                            onChange={(e) => updateForm('date', e.target.value)}
                                            aria-invalid={Boolean(errors.date)}
                                            aria-describedby={errors.date ? 'inversion-fecha-error' : undefined}
                                            required
                                        />
                                    </Field>
                                    <Field label="Tipo de movimiento" htmlFor="inversion-tipo">
                                        <select
                                            id="inversion-tipo"
                                            className="form-input form-select"
                                            value={form.movType}
                                            onChange={(e) => updateForm('movType', e.target.value)}
                                        >
                                            {Object.entries(MOVEMENTS).map(([value, movement]) => <option key={value} value={value}>{movement.option}</option>)}
                                        </select>
                                    </Field>
                                    {!isValueUpdate && (
                                        <Field label={MOVEMENTS[form.movType].amountLabel} htmlFor="inversion-importe" error={errors.amount}>
                                            <AmountInput
                                                id="inversion-importe"
                                                value={form.amount}
                                                onChange={(value) => updateForm('amount', value)}
                                                aria-invalid={Boolean(errors.amount)}
                                                aria-describedby={errors.amount ? 'inversion-importe-error' : undefined}
                                                required
                                            />
                                        </Field>
                                    )}
                                    <Field
                                        label="Valor total después del movimiento (€)"
                                        htmlFor="inversion-valor"
                                        hint={impactPreview && !form.current_value ? `Estimación: ${amountToInput(impactPreview.newValue)} €` : 'Lo que vale ahora el producto.'}
                                        error={errors.current_value}
                                    >
                                        <AmountInput
                                            id="inversion-valor"
                                            value={form.current_value}
                                            onChange={(value) => updateForm('current_value', value)}
                                            aria-invalid={Boolean(errors.current_value)}
                                            aria-describedby={errors.current_value ? 'inversion-valor-error' : 'inversion-valor-ayuda'}
                                            required
                                        />
                                    </Field>
                                </div>

                                {impactPreview && (
                                    <div className={`smart-alert mb-md ${impactPreview.isEntry ? 'success' : 'warning'}`}>
                                        <div className="smart-alert-content">
                                            <div className="smart-alert-title">
                                                {impactPreview.isEntry ? 'Esta aportación' : 'Esta retirada'} cambiará tu exposición
                                            </div>
                                            <div className="smart-alert-desc">
                                                De {formatPct(impactPreview.currentWeight)} a {formatPct(impactPreview.newWeight)} de tu cartera
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <Field label="Notas (opcional)" htmlFor="inversion-notas">
                                    <textarea
                                        id="inversion-notas"
                                        className="form-input"
                                        rows="2"
                                        value={form.notes}
                                        onChange={(e) => updateForm('notes', e.target.value)}
                                    />
                                </Field>
                                <div className="form-actions">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Guardando…' : editingId ? 'Actualizar movimiento' : 'Guardar movimiento'}
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

                    <section className="card" aria-labelledby="inversion-lista-titulo">
                        <div className="card-header"><h2 id="inversion-lista-titulo">Últimos movimientos</h2></div>
                        <div className="card-body">
                            {investments.length === 0 ? (
                                <EmptyState title="Todavía no hay movimientos" text="Registra tu primera aportación con el formulario." />
                            ) : (
                                <ul className="record-list record-list-scroll">
                                    {investments.slice(0, 15).map((inv) => {
                                        const contribution = Number(inv.contribution);
                                        const badge = BADGES[movementOf(contribution)];
                                        const date = formatDate(inv.date);
                                        return (
                                            <li key={inv.id} className={`record-item record-item-${movementOf(contribution)} ${editingId === inv.id ? 'is-editing' : ''}`.trim()}>
                                                <div className="record-item-head">
                                                    <span className="font-semibold">{inv.account}</span>
                                                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                                                </div>
                                                <div className="record-item-meta">
                                                    <span>{date}</span>
                                                    {contribution !== 0 && <Money value={contribution} signed />}
                                                </div>
                                                <div className="record-item-meta">
                                                    <span>Valor después</span>
                                                    <Money value={inv.current_value} className="font-semibold" />
                                                </div>
                                                <div className="record-actions">
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEdit(inv)} aria-label={`Editar el movimiento de ${inv.account} del ${date}`}>
                                                        Editar
                                                    </button>
                                                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(inv)} aria-label={`Eliminar el movimiento de ${inv.account} del ${date}`}>
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
            )}
        </div>
    );
}
