'use client';

import { useState, useEffect, useMemo } from 'react';

export default function InversionesRegistroPage() {
    const [products, setProducts] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showConfirm, setShowConfirm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const initialFormState = {
        date: new Date().toISOString().split('T')[0],
        account: '',
        asset_type: '',
        movType: 'entrada',
        amount: '',
        current_value: '',
        notes: '',
    };

    const [form, setForm] = useState(initialFormState);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [prodRes, invRes] = await Promise.all([
                fetch('/api/investment-products'),
                fetch('/api/investments'),
            ]);
            if (prodRes.ok) {
                const prods = await prodRes.json();
                setProducts(prods);
                // Only set default if NOT editing and no account selected
                if (!editingId && !form.account && prods.length > 0) {
                    setForm((f) => ({ ...f, account: prods[0].name, asset_type: prods[0].asset_type }));
                }
            }
            if (invRes.ok) setInvestments(await invRes.json());
        } catch (error) {
            console.error('Error:', error);
        }
        setLoading(false);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleProductChange = (name) => {
        const product = products.find((p) => p.name === name);
        setForm({ ...form, account: name, asset_type: product?.asset_type || '' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm({
            ...initialFormState,
            account: products.length > 0 ? products[0].name : '',
            asset_type: products.length > 0 ? products[0].asset_type : ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEdit = (inv) => {
        setEditingId(inv.id);
        const contribution = parseFloat(inv.contribution);
        setForm({
            date: inv.date.split('T')[0],
            account: inv.account,
            asset_type: inv.asset_type,
            movType: contribution >= 0 ? 'entrada' : 'salida',
            amount: Math.abs(contribution), // Show positive amount
            current_value: inv.current_value,
            notes: inv.notes || '',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Calculate product stats
    const productStats = useMemo(() => {
        if (!form.account) return null;

        const productInvestments = investments.filter(i => i.account === form.account);
        // If editing, exclude the current investment from "past stats" to avoid double counting or confusion?
        // Actually for "Current Value" history it might be tricky. 
        // Let's keep it simple: stats based on server data (which includes the item being edited, but that's what we have).
        // A more advanced edit might subtract the old values first, but that's complex. 
        // For now, let's just show stats as they are in DB.

        if (productInvestments.length === 0) return null;

        const totalContrib = productInvestments.reduce((sum, i) => sum + parseFloat(i.contribution), 0);
        const currentValue = productInvestments.length > 0
            ? parseFloat(productInvestments[productInvestments.length - 1].current_value)
            : 0;
        const gain = currentValue - totalContrib;
        const returnPct = totalContrib !== 0 ? (gain / totalContrib) * 100 : 0;

        // Calculate total portfolio value
        const accountData = {};
        investments.forEach((inv) => {
            if (!accountData[inv.account]) accountData[inv.account] = { currentValue: 0 };
            accountData[inv.account].currentValue = parseFloat(inv.current_value);
        });
        const totalPortfolio = Object.values(accountData).reduce((sum, a) => sum + a.currentValue, 0);
        const weight = totalPortfolio > 0 ? (currentValue / totalPortfolio) * 100 : 0;

        return { totalContrib, currentValue, gain, returnPct, weight, totalPortfolio };
    }, [form.account, investments]);

    // Calculate impact preview
    const impactPreview = useMemo(() => {
        if (!productStats || !form.amount) return null;

        // If editing, this preview is slightly inaccurate because it adds to the EXISTING total (which already includes this item).
        // Use with caution when editing. Maybe hide or show different text?
        if (editingId) return null;

        const amount = parseFloat(form.amount) || 0;
        const isEntry = form.movType === 'entrada';
        const newContrib = productStats.totalContrib + (isEntry ? amount : -amount);
        const newValue = form.current_value
            ? parseFloat(form.current_value)
            : productStats.currentValue + (isEntry ? amount : -amount);

        const newTotalPortfolio = productStats.totalPortfolio - productStats.currentValue + newValue;
        // const currentWeight = productStats.weight;
        const newWeight = newTotalPortfolio > 0 ? (newValue / newTotalPortfolio) * 100 : 0;

        return {
            isEntry,
            amount,
            currentWeight: productStats.weight,
            newWeight,
            currentValue: productStats.currentValue,
            newValue
        };
    }, [productStats, form.amount, form.current_value, form.movType, editingId]);

    const handleSubmitClick = (e) => {
        e.preventDefault();
        if (!form.account || !form.amount) {
            showMessage('error', 'Completa todos los campos obligatorios');
            return;
        }
        setShowConfirm(true);
    };

    const handleConfirmSubmit = async () => {
        setShowConfirm(false);
        setSaving(true);
        const contribution = form.movType === 'entrada'
            ? parseFloat(form.amount)
            : -parseFloat(form.amount);

        try {
            const method = editingId ? 'PUT' : 'POST';
            const body = {
                date: form.date,
                account: form.account,
                asset_type: form.asset_type,
                contribution,
                current_value: parseFloat(form.current_value) || 0,
                notes: form.notes,
            };

            if (editingId) body.id = editingId;

            const res = await fetch('/api/investments', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                showMessage('success', `Movimiento ${editingId ? 'actualizado' : 'guardado'}`);
                cancelEdit();
                loadData();
            } else {
                showMessage('error', `Error al ${editingId ? 'actualizar' : 'guardar'}`);
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        try {
            const res = await fetch(`/api/investments?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Eliminado');
                if (editingId === id) cancelEdit();
                loadData();
            }
        } catch (error) {
            showMessage('error', 'Error');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const getMovementBadge = (contribution) => {
        const val = parseFloat(contribution);
        if (val > 0) return { label: 'Aportación', class: 'badge-success' };
        if (val < 0) return { label: 'Venta', class: 'badge-danger' };
        return { label: 'Rebalanceo', class: 'badge-primary' };
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Registro de inversiones</h1>
                <p className="page-subtitle">Registra y gestiona tus movimientos de inversión</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            {products.length === 0 ? (
                <div className="alert alert-warning">
                    No tienes productos de inversión. Ve a Productos inversión para crear al menos uno.
                </div>
            ) : (
                <div className="grid grid-2 gap-lg">
                    {/* Form */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
                            {editingId && (
                                <button className="btn btn-sm btn-outline" onClick={cancelEdit}>
                                    Cancelar
                                </button>
                            )}
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSubmitClick}>
                                <div className="form-group">
                                    <label className="form-label">Producto de inversión</label>
                                    <select
                                        className="form-input form-select"
                                        value={form.account}
                                        onChange={(e) => handleProductChange(e.target.value)}
                                        disabled={!!editingId} // Bloquear cambio de producto al editar por seguridad/simplicidad? O permitirlo? Permitirlo está bien.
                                    >
                                        {products.map((p) => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                    <small className="text-muted">Tipo: {form.asset_type}</small>
                                </div>

                                {/* Product Stats Panel */}
                                {productStats && !editingId && (
                                    <div className="impact-preview" style={{ marginBottom: 'var(--spacing-md)' }}>
                                        <div className="impact-preview-title">📊 Estado actual del producto</div>
                                        <div className="impact-preview-row">
                                            <span>Valor actual:</span>
                                            <span className="font-semibold">{formatCurrency(productStats.currentValue)}</span>
                                        </div>
                                        <div className="impact-preview-row">
                                            <span>Plusvalía:</span>
                                            <span className={productStats.gain >= 0 ? 'text-success' : 'text-danger'}>
                                                {formatCurrency(productStats.gain)} ({productStats.returnPct.toFixed(1)}%)
                                            </span>
                                        </div>
                                        <div className="impact-preview-row">
                                            <span>Peso en cartera:</span>
                                            <span>{productStats.weight.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-2 gap-md">
                                    <div className="form-group">
                                        <label className="form-label">Fecha</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={form.date}
                                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Tipo de movimiento</label>
                                        <select
                                            className="form-input form-select"
                                            value={form.movType}
                                            onChange={(e) => setForm({ ...form, movType: e.target.value })}
                                        >
                                            <option value="entrada">Entrada (aportación)</option>
                                            <option value="salida">Salida (venta/retirada)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{form.movType === 'salida' ? 'Importe retirado' : 'Importe aportado'} (€)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="form-input"
                                            value={form.amount}
                                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Valor total tras movimiento (€)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="form-input"
                                            placeholder={impactPreview ? impactPreview.newValue.toFixed(2) : ''}
                                            value={form.current_value}
                                            onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Impact Preview (Only for new) */}
                                {impactPreview && (
                                    <div className={`smart-alert ${impactPreview.isEntry ? 'success' : 'warning'}`} style={{ marginTop: 'var(--spacing-md)' }}>
                                        <span className="smart-alert-icon">{impactPreview.isEntry ? '📈' : '📉'}</span>
                                        <div className="smart-alert-content">
                                            <div className="smart-alert-title">
                                                {impactPreview.isEntry ? 'Esta aportación' : 'Esta salida'}
                                                {' '}cambiará tu exposición
                                            </div>
                                            <div className="smart-alert-desc">
                                                De {impactPreview.currentWeight.toFixed(1)}% a {impactPreview.newWeight.toFixed(1)}% de tu cartera
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="form-group" style={{ marginTop: 'var(--spacing-md)' }}>
                                    <label className="form-label">Notas</label>
                                    <textarea
                                        className="form-input"
                                        rows="2"
                                        value={form.notes}
                                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Guardando...' : editingId ? 'Actualizar movimiento' : 'Guardar movimiento'}
                                    </button>
                                    {editingId && (
                                        <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                                            Cancelar
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Recent Movements */}
                    <div className="card">
                        <div className="card-header"><h3>Últimos movimientos</h3></div>
                        <div className="card-body">
                            {investments.length === 0 ? (
                                <div className="empty-state"><p>No hay movimientos registrados</p></div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '600px', overflowY: 'auto' }}>
                                    {investments.slice(0, 15).map((inv) => {
                                        const badge = getMovementBadge(inv.contribution);
                                        const gain = parseFloat(inv.current_value) - parseFloat(inv.contribution);
                                        return (
                                            <div
                                                key={inv.id}
                                                style={{
                                                    padding: '0.75rem',
                                                    background: editingId === inv.id ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                                                    borderRadius: 'var(--border-radius-sm)',
                                                    borderLeft: `3px solid ${parseFloat(inv.contribution) >= 0 ? 'var(--success)' : 'var(--danger)'}`,
                                                    border: editingId === inv.id ? '1px solid var(--primary-color)' : ''
                                                }}
                                            >
                                                <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                                                    <div className="font-semibold">{inv.account}</div>
                                                    <span className={`badge ${badge.class}`}>{badge.label}</span>
                                                </div>
                                                <div className="flex-between text-sm">
                                                    <span className="text-muted">
                                                        {new Date(inv.date).toLocaleDateString('es-ES')}
                                                    </span>
                                                    <span className={parseFloat(inv.contribution) >= 0 ? 'text-success' : 'text-danger'}>
                                                        {formatCurrency(inv.contribution)}
                                                    </span>
                                                </div>
                                                <div className="flex-between text-sm mt-sm">
                                                    <span className="text-muted">Valor actual:</span>
                                                    <span className="font-semibold">{formatCurrency(inv.current_value)}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-icon btn-secondary text-sm"
                                                        onClick={() => handleEdit(inv)}
                                                        style={{ padding: '4px 8px', flex: 1 }}
                                                    >
                                                        ✏️ Editar
                                                    </button>
                                                    <button
                                                        className="btn btn-icon btn-danger text-sm"
                                                        onClick={() => handleDelete(inv.id)}
                                                        style={{ padding: '4px 8px' }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            {showConfirm && (
                <div className="confirm-dialog-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog-icon">
                            {form.movType === 'entrada' ? '💰' : '💸'}
                        </div>
                        <div className="confirm-dialog-title">
                            {editingId ? 'Confirmar actualización' : `Confirmar ${form.movType === 'entrada' ? 'aportación' : 'salida'}`}
                        </div>
                        <div className="confirm-dialog-message">
                            {editingId ? 'Estás actualizando este movimiento:' : `Estás ${form.movType === 'entrada' ? 'invirtiendo' : 'retirando'}:`}
                            <br />
                            <strong>{formatCurrency(parseFloat(form.amount) || 0)}</strong>{' '}
                            {form.movType === 'entrada' ? 'en' : 'de'} <strong>{form.account}</strong>.
                            <br />¿Deseas guardar?
                        </div>
                        <div className="confirm-dialog-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowConfirm(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConfirmSubmit}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
