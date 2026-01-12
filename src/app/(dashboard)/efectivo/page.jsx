'use client';

import { useState, useEffect } from 'react';

export default function EfectivoPage() {
    const [snapshots, setSnapshots] = useState([]);
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
            const res = await fetch('/api/cash');
            if (res.ok) {
                const data = await res.json();
                setSnapshots(data);
                // Sugerir cuenta existente
                if (data.length > 0 && !form.account) {
                    setForm((f) => ({ ...f, account: data[0].account }));
                }
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

    // Cuentas únicas para sugerencias
    const uniqueAccounts = [...new Set(snapshots.map((s) => s.account))];

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Registro de efectivo</h1>
                <p className="page-subtitle">Registra el saldo de tus cuentas bancarias (snapshots mensuales)</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            <div className="card mb-lg">
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
                        </div>
                        <div className="form-group">
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

            <div className="card">
                <div className="card-header"><h3>Últimos snapshots</h3></div>
                <div className="card-body">
                    {snapshots.length === 0 ? (
                        <div className="empty-state"><p>No hay snapshots registrados</p></div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Cuenta</th>
                                        <th>Saldo</th>
                                        <th>Notas</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshots.slice(0, 30).map((s) => (
                                        <tr key={s.id}>
                                            <td>{new Date(s.date).toLocaleDateString('es-ES')}</td>
                                            <td className="font-semibold">{s.account}</td>
                                            <td className="text-success">{formatCurrency(s.current_value)}</td>
                                            <td className="text-muted text-sm">{s.notes || '-'}</td>
                                            <td>
                                                <button className="btn btn-icon" onClick={() => handleDelete(s.id)}>🗑️</button>
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
