'use client';

import { useState, useEffect } from 'react';

export default function CategoryStep({ type = 'expense' }) {
    const [categories, setCategories] = useState([]);
    const [newCategory, setNewCategory] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const isExpense = type === 'expense';
    const title = isExpense ? 'Categorías de gasto' : 'Categorías de ingreso';
    const placeholder = isExpense ? 'Ej: Alimentación, Transporte, Ocio...' : 'Ej: Nómina, Freelance, Dividendos...';

    useEffect(() => {
        loadCategories();
    }, [type]);

    const loadCategories = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/categories?type=${type}`);
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
        setLoading(false);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newCategory.trim()) return;

        setSaving(true);
        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCategory.trim(), type })
            });

            if (res.ok) {
                setNewCategory('');
                loadCategories();
                setMessage({ type: 'success', text: '¡Categoría añadida!' });
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

    const handleDelete = async (name) => {
        try {
            const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}&type=${type}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                loadCategories();
            }
        } catch (error) {
            console.error('Error deleting category:', error);
        }
    };

    const defaultCategories = isExpense
        ? ['Alimentación', 'Transporte', 'Hogar', 'Ocio', 'Salud', 'Ropa', 'Restaurantes', 'Subscripciones']
        : ['Nómina', 'Freelance', 'Dividendos', 'Alquiler', 'Otros ingresos'];

    const addDefaultCategories = async () => {
        setSaving(true);
        for (const cat of defaultCategories) {
            if (!categories.find(c => c.name === cat)) {
                await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cat, type })
                });
            }
        }
        await loadCategories();
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
            {categories.length === 0 && (
                <div className="onboarding-hint" style={{ marginBottom: '1.5rem' }}>
                    <p style={{ marginBottom: '0.75rem' }}>
                        💡 <strong>Consejo:</strong> Puedes empezar con estas categorías predefinidas:
                    </p>
                    <button
                        onClick={addDefaultCategories}
                        className="btn btn-secondary"
                        disabled={saving}
                    >
                        {saving ? 'Añadiendo...' : `Añadir categorías sugeridas (${defaultCategories.length})`}
                    </button>
                </div>
            )}

            {/* Add form */}
            <form onSubmit={handleAdd} className="onboarding-add-form">
                <input
                    type="text"
                    className="form-input"
                    placeholder={placeholder}
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    maxLength={100}
                />
                <button type="submit" className="btn btn-primary" disabled={saving || !newCategory.trim()}>
                    + Añadir
                </button>
            </form>

            {message.text && (
                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem' }}>
                    {message.text}
                </div>
            )}

            {/* Categories list */}
            <div className="onboarding-list" style={{ marginTop: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                    {categories.length > 0 ? `Tus categorías (${categories.length})` : 'Aún no tienes categorías'}
                </h4>

                {categories.length > 0 ? (
                    <div className="category-chips">
                        {categories.map((cat) => (
                            <div key={cat.name} className="category-chip">
                                <span>{cat.name}</span>
                                <button
                                    onClick={() => handleDelete(cat.name)}
                                    className="chip-delete"
                                    title="Eliminar"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">Añade al menos una categoría para continuar</p>
                )}
            </div>
        </div>
    );
}
