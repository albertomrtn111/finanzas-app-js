'use client';

import { useState, useEffect } from 'react';

export default function ProductosPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [form, setForm] = useState({ name: '', asset_type: 'Fondo indexado' });

    const assetTypes = ['Fondo indexado', 'ETF', 'Acciones', 'Bonos', 'Criptomonedas', 'Plan de pensiones', 'Inmuebles', 'Otro'];

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/investment-products');
            if (res.ok) setProducts(await res.json());
        } catch (error) {
            console.error('Error:', error);
        }
        setLoading(false);
    };

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
                loadProducts();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
            const res = await fetch(`/api/investment-products?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Eliminado');
                loadProducts();
            }
        } catch (error) {
            showMessage('error', 'Error');
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {products.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex-between"
                                        style={{
                                            padding: '0.75rem 1rem',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--border-radius-sm)',
                                        }}
                                    >
                                        <div>
                                            <div className="font-semibold">{p.name}</div>
                                            <div className="text-muted text-sm">{p.asset_type}</div>
                                        </div>
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => handleDelete(p.id)}
                                            style={{ color: 'var(--danger)' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
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
                    </div>
                </div>
            </div>
        </div>
    );
}
