'use client';

import { useState, useEffect } from 'react';

export default function ProductStep() {
    const [products, setProducts] = useState([]);
    const [formData, setFormData] = useState({ name: '', asset_type: 'ETF' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const assetTypes = ['ETF', 'Fondo indexado', 'Acciones', 'Crypto', 'Bonos', 'Inmuebles', 'Otro'];

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/investment-products');
            if (res.ok) {
                const data = await res.json();
                setProducts(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading products:', error);
        }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        setSaving(true);
        try {
            const res = await fetch('/api/investment-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setFormData({ name: '', asset_type: 'ETF' });
                loadProducts();
                setMessage({ type: 'success', text: '¡Producto añadido!' });
                setTimeout(() => setMessage({ type: '', text: '' }), 2000);
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.error || 'Error al añadir' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error de conexión' });
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/investment-products?id=${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                loadProducts();
            }
        } catch (error) {
            console.error('Error deleting product:', error);
        }
    };

    const defaultProducts = [
        { name: 'Vanguard S&P 500', asset_type: 'ETF' },
        { name: 'MSCI World', asset_type: 'Fondo indexado' },
        { name: 'Bitcoin', asset_type: 'Crypto' },
    ];

    const addDefaultProducts = async () => {
        setSaving(true);
        for (const prod of defaultProducts) {
            if (!products.find(p => p.name === prod.name)) {
                await fetch('/api/investment-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(prod)
                });
            }
        }
        await loadProducts();
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ padding: '2rem' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="onboarding-step-content">
            {/* Quick add defaults */}
            {products.length === 0 && (
                <div className="onboarding-hint" style={{ marginBottom: '1.5rem' }}>
                    <p style={{ marginBottom: '0.75rem' }}>
                        💡 <strong>Consejo:</strong> Puedes empezar con estos productos populares:
                    </p>
                    <button
                        onClick={addDefaultProducts}
                        className="btn btn-secondary"
                        disabled={saving}
                    >
                        {saving ? 'Añadiendo...' : 'Añadir productos sugeridos'}
                    </button>
                </div>
            )}

            {/* Add form */}
            <form onSubmit={handleSubmit} className="onboarding-add-form" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="Nombre del producto (ej: Vanguard S&P 500)"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ flex: '2', minWidth: '200px' }}
                />
                <select
                    className="form-select"
                    value={formData.asset_type}
                    onChange={(e) => setFormData({ ...formData, asset_type: e.target.value })}
                    style={{ flex: '1', minWidth: '120px' }}
                >
                    {assetTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
                <button type="submit" className="btn btn-primary" disabled={saving || !formData.name.trim()}>
                    + Añadir
                </button>
            </form>

            {message.text && (
                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem' }}>
                    {message.text}
                </div>
            )}

            {/* Products list */}
            <div className="onboarding-list" style={{ marginTop: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                    {products.length > 0 ? `Tus productos (${products.length})` : 'Aún no tienes productos'}
                </h4>

                {products.length > 0 ? (
                    <div className="product-list">
                        {products.map((prod) => (
                            <div key={prod.id} className="product-item">
                                <div>
                                    <span className="product-name">{prod.name}</span>
                                    <span className="badge badge-secondary" style={{ marginLeft: '0.5rem' }}>{prod.asset_type}</span>
                                </div>
                                <button
                                    onClick={() => handleDelete(prod.id)}
                                    className="btn btn-ghost btn-sm"
                                    title="Eliminar"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">Añade al menos un producto de inversión para continuar</p>
                )}
            </div>
        </div>
    );
}
