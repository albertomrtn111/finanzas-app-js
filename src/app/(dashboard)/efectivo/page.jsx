'use client';

import { useState, useEffect, useMemo } from 'react';

export default function EfectivoPage() {
    const [snapshots, setSnapshots] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        account: '',
        current_value: '',
        notes: '',
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [cashRes, invRes] = await Promise.all([
                fetch('/api/cash'),
                fetch('/api/investments'),
            ]);
            if (cashRes.ok) {
                const data = await cashRes.json();
                const cashData = Array.isArray(data) ? data : [];
                setSnapshots(cashData);
                if (cashData.length > 0 && !form.account) {
                    setForm((f) => ({ ...f, account: cashData[0].account }));
                }
            }
            if (invRes.ok) {
                const invData = await invRes.json();
                setInvestments(Array.isArray(invData) ? invData : []);
            }
        } catch (error) {
            console.error('Error:', error);
        }
        setLoading(false);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    // Calculate current cash total (latest snapshot per account)
    const cashByAccount = useMemo(() => {
        const accounts = {};
        snapshots.forEach((snap) => {
            if (!accounts[snap.account] || new Date(snap.date) > new Date(accounts[snap.account].date)) {
                accounts[snap.account] = snap;
            }
        });
        return accounts;
    }, [snapshots]);

    const totalCash = useMemo(() => {
        return Object.values(cashByAccount).reduce((sum, snap) => sum + parseFloat(snap.current_value), 0);
    }, [cashByAccount]);

    // Previous month cash for trend
    const previousMonthCash = useMemo(() => {
        const now = new Date();
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

        const prevSnapshots = snapshots.filter(s => {
            const d = new Date(s.date);
            return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
        });

        const accounts = {};
        prevSnapshots.forEach((snap) => {
            if (!accounts[snap.account] || new Date(snap.date) > new Date(accounts[snap.account].date)) {
                accounts[snap.account] = snap;
            }
        });

        return Object.values(accounts).reduce((sum, snap) => sum + parseFloat(snap.current_value), 0);
    }, [snapshots]);

    const cashVariation = previousMonthCash > 0
        ? ((totalCash - previousMonthCash) / previousMonthCash) * 100
        : 0;

    // Calculate total patrimony for percentage
    const totalInvestments = useMemo(() => {
        const accounts = {};
        investments.forEach((inv) => {
            if (!accounts[inv.account] || new Date(inv.date) > new Date(accounts[inv.account].date)) {
                accounts[inv.account] = inv;
            }
        });
        return Object.values(accounts).reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);
    }, [investments]);

    const totalPatrimonio = totalCash + totalInvestments;
    const cashPercentage = totalPatrimonio > 0 ? (totalCash / totalPatrimonio) * 100 : 0;

    // Current account liquidity for preview
    const currentAccountCash = useMemo(() => {
        if (!form.account) return 0;
        return cashByAccount[form.account]
            ? parseFloat(cashByAccount[form.account].current_value)
            : 0;
    }, [form.account, cashByAccount]);

    // Liquidity preview
    const liquidityPreview = useMemo(() => {
        if (!form.current_value || !form.account) return null;
        const newValue = parseFloat(form.current_value);
        const diff = newValue - currentAccountCash;
        return { currentValue: currentAccountCash, newValue, diff };
    }, [form.current_value, form.account, currentAccountCash]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.account || !form.current_value) {
            showMessage('error', 'Completa cuenta y saldo');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/cash', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            if (res.ok) {
                showMessage('success', 'Snapshot guardado');
                setForm({ ...form, current_value: '', notes: '' });
                loadData();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error al guardar');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este snapshot?')) return;
        try {
            const res = await fetch(`/api/cash?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Eliminado');
                loadData();
            }
        } catch (error) {
            showMessage('error', 'Error');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    // Unique accounts for suggestions
    const uniqueAccounts = [...new Set(snapshots.map((s) => s.account))];

    // Calculate trends for each snapshot
    const getSnapshotTrend = (snapshot, idx) => {
        const sameAccountSnapshots = snapshots
            .filter(s => s.account === snapshot.account && new Date(s.date) < new Date(snapshot.date))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (sameAccountSnapshots.length === 0) return null;

        const prevValue = parseFloat(sameAccountSnapshots[0].current_value);
        const currValue = parseFloat(snapshot.current_value);
        const diff = currValue - prevValue;

        return { diff, isUp: diff >= 0 };
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Registro de efectivo</h1>
                <p className="page-subtitle">Registra el saldo de tus cuentas bancarias (snapshots mensuales)</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            {/* Liquidity Dashboard */}
            <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Total efectivo actual</div>
                    <div className="kpi-value" style={{ color: 'var(--primary)' }}>
                        {formatCurrency(totalCash)}
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Variación vs mes anterior</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${cashVariation >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {formatCurrency(totalCash - previousMonthCash)}
                        </div>
                    </div>
                    {previousMonthCash > 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${cashVariation >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(cashVariation).toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">% del patrimonio</div>
                    <div className="kpi-value">{cashPercentage.toFixed(1)}%</div>
                    <div className="kpi-trend">
                        <span className="text-muted text-sm">
                            {cashPercentage > 30
                                ? '💡 Alta liquidez'
                                : cashPercentage < 10
                                    ? '⚠️ Baja liquidez'
                                    : 'Equilibrado'}
                        </span>
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Cuentas activas</div>
                    <div className="kpi-value">{Object.keys(cashByAccount).length}</div>
                </div>
            </div>

            <div className="grid grid-2 gap-lg">
                {/* Form */}
                <div className="card">
                    <div className="card-header"><h3>Nuevo snapshot</h3></div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit}>
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
                                    <label className="form-label">Cuenta</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="ej: Caixa, Trade Republic..."
                                        list="cuentas"
                                        value={form.account}
                                        onChange={(e) => setForm({ ...form, account: e.target.value })}
                                    />
                                    <datalist id="cuentas">
                                        {uniqueAccounts.map((acc) => (
                                            <option key={acc} value={acc} />
                                        ))}
                                    </datalist>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Saldo (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="form-input"
                                    value={form.current_value}
                                    onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                                />
                            </div>

                            {/* Liquidity Preview */}
                            {liquidityPreview && (
                                <div className={`smart-alert ${liquidityPreview.diff >= 0 ? 'success' : 'warning'}`}>
                                    <span className="smart-alert-icon">{liquidityPreview.diff >= 0 ? '📈' : '📉'}</span>
                                    <div className="smart-alert-content">
                                        <div className="smart-alert-title">Tu liquidez cambiará</div>
                                        <div className="smart-alert-desc">
                                            De {formatCurrency(liquidityPreview.currentValue)} a {formatCurrency(liquidityPreview.newValue)}
                                            {' '}({liquidityPreview.diff >= 0 ? '+' : ''}{formatCurrency(liquidityPreview.diff)})
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="form-group" style={{ marginTop: 'var(--spacing-md)' }}>
                                <label className="form-label">Notas (opcional)</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar snapshot'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Recent Snapshots */}
                <div className="card">
                    <div className="card-header"><h3>Últimos snapshots</h3></div>
                    <div className="card-body">
                        {snapshots.length === 0 ? (
                            <div className="empty-state"><p>No hay snapshots registrados</p></div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                                {snapshots.slice(0, 20).map((s, idx) => {
                                    const trend = getSnapshotTrend(s, idx);
                                    return (
                                        <div
                                            key={s.id}
                                            style={{
                                                padding: '0.75rem',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--border-radius-sm)',
                                            }}
                                        >
                                            <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                                                <div className="font-semibold">{s.account}</div>
                                                <span className="text-success font-semibold">
                                                    {formatCurrency(s.current_value)}
                                                </span>
                                            </div>
                                            <div className="flex-between text-sm">
                                                <span className="text-muted">
                                                    {new Date(s.date).toLocaleDateString('es-ES')}
                                                </span>
                                                {trend && (
                                                    <span className={`trend ${trend.isUp ? 'trend-up' : 'trend-down'}`}>
                                                        {trend.isUp ? '+' : ''}{formatCurrency(trend.diff)}
                                                    </span>
                                                )}
                                            </div>
                                            {s.notes && (
                                                <div className="text-muted text-sm mt-sm">{s.notes}</div>
                                            )}
                                            <button
                                                className="btn btn-icon text-sm"
                                                onClick={() => handleDelete(s.id)}
                                                style={{ marginTop: '0.5rem', padding: '4px 8px' }}
                                            >
                                                🗑️ Eliminar
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
