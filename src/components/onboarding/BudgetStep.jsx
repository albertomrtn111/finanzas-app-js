'use client';

import { useState, useEffect } from 'react';

export default function BudgetStep() {
    const [categories, setCategories] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [catRes, budRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/budgets')
            ]);

            if (catRes.ok) {
                const catData = await catRes.json();
                setCategories(Array.isArray(catData) ? catData : []);
            }

            if (budRes.ok) {
                const budData = await budRes.json();
                const budgetMap = {};
                if (Array.isArray(budData)) {
                    budData.forEach(b => {
                        budgetMap[b.category] = parseFloat(b.monthly_amount) || 0;
                    });
                }
                setBudgets(budgetMap);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    };

    const handleChange = (category, value) => {
        setBudgets(prev => ({
            ...prev,
            [category]: value === '' ? '' : parseFloat(value) || 0
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Prepare budget entries
            const entries = categories.map(cat => ({
                category: cat.name,
                monthly_amount: budgets[cat.name] || 0
            }));

            const res = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budgets: entries })
            });

            if (res.ok) {
                setMessage({ type: 'success', text: '¡Presupuestos guardados!' });
                setTimeout(() => setMessage({ type: '', text: '' }), 2000);
            } else {
                setMessage({ type: 'error', text: 'Error al guardar' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error de conexión' });
        }
        setSaving(false);
    };

    const totalBudget = Object.values(budgets).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const applyDefaultBudgets = () => {
        const defaults = {
            'Alimentación': 400,
            'Transporte': 150,
            'Hogar': 200,
            'Ocio': 150,
            'Salud': 50,
            'Ropa': 75,
            'Restaurantes': 100,
            'Subscripciones': 50
        };

        const newBudgets = { ...budgets };
        categories.forEach(cat => {
            if (defaults[cat.name] && !newBudgets[cat.name]) {
                newBudgets[cat.name] = defaults[cat.name];
            }
        });
        setBudgets(newBudgets);
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ padding: '2rem' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (categories.length === 0) {
        return (
            <div className="onboarding-step-content">
                <div className="empty-state">
                    <p>⚠️ No tienes categorías de gasto definidas.</p>
                    <p className="text-muted">Vuelve al paso 1 para crear categorías primero.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="onboarding-step-content">
            {/* Hint */}
            <div className="onboarding-hint" style={{ marginBottom: '1.5rem' }}>
                <p>
                    💡 Define cuánto quieres gastar al mes en cada categoría.
                    Esto te ayudará a controlar tus gastos.
                </p>
                <button
                    onClick={applyDefaultBudgets}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '0.5rem' }}
                >
                    Aplicar valores sugeridos
                </button>
            </div>

            {/* Budget form */}
            <div className="budget-form">
                {categories.map(cat => (
                    <div key={cat.name} className="budget-row">
                        <label className="budget-label">{cat.name}</label>
                        <div className="budget-input-wrapper">
                            <input
                                type="number"
                                className="form-input"
                                placeholder="0"
                                min="0"
                                step="10"
                                value={budgets[cat.name] || ''}
                                onChange={(e) => handleChange(cat.name, e.target.value)}
                            />
                            <span className="budget-currency">€/mes</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Total */}
            <div className="budget-total" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>Presupuesto mensual total</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary)' }}>
                        {formatCurrency(totalBudget)}
                    </span>
                </div>
            </div>

            {message.text && (
                <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginTop: '1rem' }}>
                    {message.text}
                </div>
            )}

            {/* Save button */}
            <button
                onClick={handleSave}
                className="btn btn-secondary"
                disabled={saving}
                style={{ marginTop: '1rem' }}
            >
                {saving ? 'Guardando...' : '💾 Guardar presupuestos'}
            </button>
        </div>
    );
}
