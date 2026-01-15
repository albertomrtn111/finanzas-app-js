'use client';

import { useState, useEffect, useMemo } from 'react';

export default function ProductosPage() {
    const [products, setProducts] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showConfirmDelete, setShowConfirmDelete] = useState(null);

    const [form, setForm] = useState({ name: '', asset_type: 'Fondo indexado' });

    const assetTypes = ['Fondo indexado', 'ETF', 'Acciones', 'Bonos', 'Criptomonedas', 'Plan de pensiones', 'Inmuebles', 'Otro'];

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
            if (prodRes.ok) setProducts(await prodRes.json());
            if (invRes.ok) setInvestments(await invRes.json());
        } catch (error) {
            console.error('Error:', error);
        }
        setLoading(false);
    };

    // Calculate stats per product
    const productStats = useMemo(() => {
        const stats = {};

        // Get latest value per account
        const latestByAccount = {};
        const contribByAccount = {};

        investments.forEach(inv => {
            if (!latestByAccount[inv.account] || new Date(inv.date) > new Date(latestByAccount[inv.account].date)) {
                latestByAccount[inv.account] = inv;
            }
            if (!contribByAccount[inv.account]) contribByAccount[inv.account] = 0;
            contribByAccount[inv.account] += parseFloat(inv.contribution);
        });

        // Total portfolio value
        const totalValue = Object.values(latestByAccount).reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);

        products.forEach(p => {
            const latest = latestByAccount[p.name];
            const contrib = contribByAccount[p.name] || 0;
            const value = latest ? parseFloat(latest.current_value) : 0;
            const gain = value - contrib;
            const returnPct = contrib !== 0 ? (gain / contrib) * 100 : 0;
            const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;

            stats[p.name] = {
                invested: contrib,
                currentValue: value,
                gain,
                returnPct,
                weight,
                hasInvestments: investments.some(i => i.account === p.name)
            };
        });

        return stats;
    }, [products, investments]);

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            showMessage('error', 'El nombre es obligatorio');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/investment-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            if (res.ok) {
                showMessage('success', 'Producto añadido');
                setForm({ name: '', asset_type: 'Fondo indexado' });
                loadData();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDeleteClick = (product) => {
        const stats = productStats[product.name];
        if (stats?.hasInvestments) {
            setShowConfirmDelete(product);
        } else {
            handleDelete(product.id);
        }
    };

    const handleDelete = async (id) => {
        setShowConfirmDelete(null);
        try {
            const res = await fetch(`/api/investment-products?id=${id}`, { method: 'DELETE' });
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

    const getProductLabel = (weight) => {
        if (weight >= 20) return { label: 'Core', class: 'core' };
        if (weight < 5 && weight > 0) return { label: 'Satellite', class: 'satellite' };
        return null;
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Productos de inversión</h1>
                <p className="page-subtitle">Gestiona tus productos de inversión (fondos, ETFs, acciones...)</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-2 gap-lg">
                <div className="card">
                    <div className="card-header"><h3>Productos actuales</h3></div>
                    <div className="card-body">
                        {products.length === 0 ? (
                            <div className="empty-state"><p>No hay productos definidos</p></div>
                        ) : (
                            <div className="product-list">
                                {products.map((p) => {
                                    const stats = productStats[p.name];
                                    const label = stats ? getProductLabel(stats.weight) : null;

                                    return (
                                        <div key={p.id} className="product-card">
                                            <div className="product-card-header">
                                                <div className="product-card-title">
                                                    <span className="font-semibold">{p.name}</span>
                                                    {label && (
                                                        <span className={`product-label ${label.class}`}>
                                                            {label.label}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    className="btn-delete"
                                                    onClick={() => handleDeleteClick(p)}
                                                    aria-label="Eliminar producto"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                            <div className="product-card-type">{p.asset_type}</div>

                                            {stats && stats.currentValue > 0 && (
                                                <div className="product-card-stats">
                                                    <div>
                                                        <div className="stat-label">Invertido</div>
                                                        <div className="stat-value">{formatCurrency(stats.invested)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="stat-label">Valor</div>
                                                        <div className="stat-value">{formatCurrency(stats.currentValue)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="stat-label">Rentab.</div>
                                                        <div className={`stat-value ${stats.returnPct >= 0 ? 'text-success' : 'text-danger'}`}>
                                                            <span className={`trend ${stats.returnPct >= 0 ? 'trend-up' : 'trend-down'}`}>
                                                                {Math.abs(stats.returnPct).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><h3>Añadir producto</h3></div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Nombre del producto</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ej: Vanguard Global Stock"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Tipo de activo</label>
                                <select
                                    className="form-input form-select"
                                    value={form.asset_type}
                                    onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                                >
                                    {assetTypes.map((type) => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Añadiendo...' : 'Añadir producto'}
                            </button>
                        </form>

                        <div className="alert alert-info" style={{ marginTop: 'var(--spacing-lg)' }}>
                            <strong>📊 Etiquetas:</strong>
                            <br />
                            <span className="product-label core" style={{ marginRight: '0.5rem' }}>Core</span>
                            Productos que representan ≥20% de tu cartera
                            <br />
                            <span className="product-label satellite" style={{ marginRight: '0.5rem' }}>Satellite</span>
                            Productos que representan &lt;5% de tu cartera
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDelete && (
                <div className="confirm-dialog-overlay" onClick={() => setShowConfirmDelete(null)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-dialog-icon">⚠️</div>
                        <div className="confirm-dialog-title">Confirmar eliminación</div>
                        <div className="confirm-dialog-message">
                            El producto <strong>{showConfirmDelete.name}</strong> tiene inversiones registradas.
                            <br /><br />
                            Si lo eliminas, perderás el seguimiento de esas inversiones. ¿Estás seguro?
                        </div>
                        <div className="confirm-dialog-actions">
                            <button className="btn btn-secondary" onClick={() => setShowConfirmDelete(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDelete(showConfirmDelete.id)}>
                                Eliminar de todos modos
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
