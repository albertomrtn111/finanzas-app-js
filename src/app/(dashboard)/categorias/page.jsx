'use client';

import { useState, useEffect } from 'react';

export default function CategoriasPage() {
    const [tab, setTab] = useState('expense');
    const [expenseCategories, setExpenseCategories] = useState([]);
    const [incomeCategories, setIncomeCategories] = useState([]);
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        setLoading(true);
        try {
            const [expRes, incRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/categories?type=income'),
            ]);
            if (expRes.ok) setExpenseCategories(await expRes.json());
            if (incRes.ok) setIncomeCategories(await incRes.json());
        } catch (error) {
            console.error('Error cargando categorías:', error);
        }
        setLoading(false);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newName.trim()) {
            showMessage('error', 'El nombre es obligatorio');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim(), type: tab }),
            });

            if (res.ok) {
                showMessage('success', 'Categoría añadida');
                setNewName('');
                loadCategories();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error al añadir');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDelete = async (name) => {
        if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;

        try {
            const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}&type=${tab}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                showMessage('success', 'Categoría eliminada');
                loadCategories();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error al eliminar');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
    };

    const categories = tab === 'expense' ? expenseCategories : incomeCategories;

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Categorías</h1>
                <p className="page-subtitle">Gestiona las categorías de gastos e ingresos</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            <div className="tabs">
                <button
                    className={`tab ${tab === 'expense' ? 'active' : ''}`}
                    onClick={() => setTab('expense')}
                >
                    Categorías de gasto
                </button>
                <button
                    className={`tab ${tab === 'income' ? 'active' : ''}`}
                    onClick={() => setTab('income')}
                >
                    Categorías de ingreso
                </button>
            </div>

            <div className="grid grid-2 gap-lg">
                <div className="card">
                    <div className="card-header">
                        <h3>Listado actual</h3>
                    </div>
                    <div className="card-body">
                        {categories.length === 0 ? (
                            <div className="empty-state">
                                <p className="text-muted">No hay categorías definidas</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {categories.map((cat) => (
                                    <div
                                        key={cat.id}
                                        className="flex-between"
                                        style={{
                                            padding: '0.75rem 1rem',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--border-radius-sm)',
                                        }}
                                    >
                                        <span>{cat.name}</span>
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => handleDelete(cat.name)}
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
                    <div className="card-header">
                        <h3>Añadir nueva categoría</h3>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleAdd}>
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre de la categoría de {tab === 'expense' ? 'gasto' : 'ingreso'}
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ej: Alimentación, Transporte..."
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={saving}
                            >
                                {saving ? 'Añadiendo...' : 'Añadir categoría'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
