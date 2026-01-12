'use client';

import { useState, useEffect } from 'react';

export default function InversionesRegistroPage() {
    const [products, setProducts] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        account: '',
        asset_type: '',
        movType: 'entrada',
        amount: '',
        current_value: '',
        notes: '',
    });

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
                if (prods.length > 0) {
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.account || !form.amount) {
            showMessage('error', 'Completa todos los campos obligatorios');
            return;
        }

        setSaving(true);
        const contribution = form.movType === 'entrada'
            ? parseFloat(form.amount)
            : -parseFloat(form.amount);

        try {
            const res = await fetch('/api/investments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: form.date,
                    account: form.account,
                    asset_type: form.asset_type,
                    contribution,
                    current_value: parseFloat(form.current_value) || 0,
                    notes: form.notes,
                }),
            });

            if (res.ok) {
                showMessage('success', 'Movimiento guardado');
                setForm({ ...form, amount: '', current_value: '', notes: '' });
                loadData();
            } else {
                showMessage('error', 'Error al guardar');
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
                loadData();
            }
        } catch (error) {
            showMessage('error', 'Error');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Registro de inversiones</h1>
                <p className="page-subtitle">Registra tus movimientos de inversión por producto</p>
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
                <div className="card mb-lg">
                    <div className="card-header"><h3>Nuevo movimiento</h3></div>
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
                                    <label className="form-label">Producto de inversión</label>
                                    <select
                                        className="form-input form-select"
                                        value={form.account}
                                        onChange={(e) => handleProductChange(e.target.value)}
                                    >
                                        {products.map((p) => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                    <small className="text-muted">Tipo: {form.asset_type}</small>
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
                                    <label className="form-label">Importe del movimiento (€)</label>
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
                                        value={form.current_value}
                                        onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notas</label>
                                <textarea
                                    className="form-input"
                                    rows="2"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar movimiento'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header"><h3>Últimos movimientos</h3></div>
                <div className="card-body">
                    {investments.length === 0 ? (
                        <div className="empty-state"><p>No hay movimientos registrados</p></div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Producto</th>
                                        <th>Tipo</th>
                                        <th>Aportación</th>
                                        <th>Valor actual</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {investments.slice(0, 20).map((inv) => (
                                        <tr key={inv.id}>
                                            <td>{new Date(inv.date).toLocaleDateString('es-ES')}</td>
                                            <td>{inv.account}</td>
                                            <td><span className="badge badge-primary">{inv.asset_type}</span></td>
                                            <td className={parseFloat(inv.contribution) >= 0 ? 'text-success' : 'text-danger'}>
                                                {formatCurrency(inv.contribution)}
                                            </td>
                                            <td className="font-semibold">{formatCurrency(inv.current_value)}</td>
                                            <td>
                                                <button className="btn btn-icon" onClick={() => handleDelete(inv.id)}>🗑️</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
