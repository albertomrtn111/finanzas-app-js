'use client';

import { useState, useEffect, useMemo } from 'react';

export default function PresupuestosPage() {
    const [categories, setCategories] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [expenses, setExpenses] = useState([]);
    const [incomes, setIncomes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [catRes, budRes, expRes, incRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/budgets'),
                fetch('/api/expenses'),
                fetch('/api/income'),
            ]);

            if (catRes.ok) {
                const cats = await catRes.json();
                setCategories(cats);

                const existingBudgets = budRes.ok ? await budRes.json() : [];
                const budgetMap = {};
                cats.forEach((cat) => {
                    const existing = existingBudgets.find((b) => b.category === cat.name);
                    budgetMap[cat.name] = existing ? parseFloat(existing.monthly_amount) : 0;
                });
                setBudgets(budgetMap);
            }
            if (expRes.ok) setExpenses(await expRes.json());
            if (incRes.ok) setIncomes(await incRes.json());
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
        setLoading(false);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleChange = (category, value) => {
        setBudgets({ ...budgets, [category]: parseFloat(value) || 0 });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const budgetArray = Object.entries(budgets).map(([category, monthly_amount]) => ({
                category,
                monthly_amount,
            }));

            const res = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budgets: budgetArray }),
            });

            if (res.ok) {
                showMessage('success', 'Presupuestos guardados correctamente');
            } else {
                showMessage('error', 'Error al guardar');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    // Current month expenses by category
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const currentMonthExpenses = useMemo(() => {
        return expenses.filter(e => {
            const d = new Date(e.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
    }, [expenses, currentMonth, currentYear]);

    const expensesByCategory = useMemo(() => {
        const byCategory = {};
        currentMonthExpenses.forEach(e => {
            if (!byCategory[e.category]) byCategory[e.category] = 0;
            byCategory[e.category] += parseFloat(e.amount);
        });
        return byCategory;
    }, [currentMonthExpenses]);

    // Calculate totals
    const totalBudget = Object.values(budgets).reduce((sum, val) => sum + val, 0);
    const totalSpent = Object.values(expensesByCategory).reduce((sum, val) => sum + val, 0);

    // Monthly income for expected savings
    const currentMonthIncome = useMemo(() => {
        return incomes
            .filter(i => {
                const d = new Date(i.date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            })
            .reduce((sum, i) => sum + parseFloat(i.amount), 0);
    }, [incomes, currentMonth, currentYear]);

    const expectedSavings = currentMonthIncome - totalBudget;

    // Categories at risk (>70%)
    const categoriesAtRisk = useMemo(() => {
        return categories
            .filter(cat => {
                const budget = budgets[cat.name] || 0;
                const spent = expensesByCategory[cat.name] || 0;
                const ratio = budget > 0 ? (spent / budget) * 100 : 0;
                return ratio >= 70;
            })
            .map(cat => ({
                name: cat.name,
                budget: budgets[cat.name] || 0,
                spent: expensesByCategory[cat.name] || 0,
                ratio: budgets[cat.name] > 0
                    ? (expensesByCategory[cat.name] || 0) / budgets[cat.name] * 100
                    : 0
            }))
            .sort((a, b) => b.ratio - a.ratio);
    }, [categories, budgets, expensesByCategory]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const getProgressColor = (ratio) => {
        if (ratio > 90) return 'red';
        if (ratio > 70) return 'yellow';
        return 'green';
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Presupuestos mensuales</h1>
                <p className="page-subtitle">
                    Define cuánto quieres gastar al mes en cada categoría
                </p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            {categories.length === 0 ? (
                <div className="alert alert-warning">
                    No hay categorías de gasto definidas. Ve a Categorías para crearlas primero.
                </div>
            ) : (
                <>
                    {/* Summary KPIs */}
                    <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Presupuesto mensual</div>
                            <div className="kpi-value">{formatCurrency(totalBudget)}</div>
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Gastado este mes</div>
                            <div className="kpi-value text-danger">{formatCurrency(totalSpent)}</div>
                            <div className="kpi-trend">
                                <span className={totalSpent <= totalBudget ? 'text-success' : 'text-danger'}>
                                    {totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(0) : 0}% del presupuesto
                                </span>
                            </div>
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Ahorro esperado</div>
                            <div className={`kpi-value ${expectedSavings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                                {formatCurrency(expectedSavings)}
                            </div>
                            <div className="kpi-trend">
                                <span className="text-muted text-sm">
                                    Ingreso - Presupuesto
                                </span>
                            </div>
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Disponible</div>
                            <div className={`kpi-value ${totalBudget - totalSpent >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                                {formatCurrency(totalBudget - totalSpent)}
                            </div>
                        </div>
                    </div>

                    {/* Categories at Risk */}
                    {categoriesAtRisk.length > 0 && (
                        <div className="card mb-lg">
                            <div className="card-body">
                                <h3 className="section-title">⚠️ Categorías en riesgo</h3>
                                <div className="smart-alerts">
                                    {categoriesAtRisk.map((cat, idx) => (
                                        <div
                                            key={idx}
                                            className={`smart-alert ${cat.ratio >= 100 ? 'danger' : 'warning'}`}
                                        >
                                            <span className="smart-alert-icon">
                                                {cat.ratio >= 100 ? '🚨' : '⚠️'}
                                            </span>
                                            <div className="smart-alert-content" style={{ flex: 1 }}>
                                                <div className="smart-alert-title">{cat.name}</div>
                                                <div className="smart-alert-desc">
                                                    {formatCurrency(cat.spent)} de {formatCurrency(cat.budget)} ({cat.ratio.toFixed(0)}%)
                                                </div>
                                            </div>
                                            <div className="progress" style={{ width: '100px', height: '8px' }}>
                                                <div
                                                    className={`progress-bar ${cat.ratio >= 100 ? 'danger' : 'warning'}`}
                                                    style={{ width: `${Math.min(cat.ratio, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Budget Form with Progress */}
                    <div className="card">
                        <div className="card-header">
                            <h3>Presupuestos por categoría</h3>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSave}>
                                <div className="grid grid-2 gap-lg">
                                    {categories.map((cat) => {
                                        const budget = budgets[cat.name] || 0;
                                        const spent = expensesByCategory[cat.name] || 0;
                                        const ratio = budget > 0 ? (spent / budget) * 100 : 0;

                                        return (
                                            <div
                                                key={cat.id}
                                                style={{
                                                    padding: 'var(--spacing-md)',
                                                    background: 'var(--bg-tertiary)',
                                                    borderRadius: 'var(--border-radius-sm)'
                                                }}
                                            >
                                                <div className="flex-between" style={{ marginBottom: 'var(--spacing-sm)' }}>
                                                    <label className="form-label" style={{ margin: 0 }}>{cat.name}</label>
                                                    <span className="text-sm text-muted">
                                                        Gastado: {formatCurrency(spent)}
                                                    </span>
                                                </div>
                                                <input
                                                    type="number"
                                                    step="10"
                                                    min="0"
                                                    className="form-input"
                                                    value={budgets[cat.name] || 0}
                                                    onChange={(e) => handleChange(cat.name, e.target.value)}
                                                />
                                                {budget > 0 && (
                                                    <div style={{ marginTop: 'var(--spacing-sm)' }}>
                                                        <div className="progress-zoned" style={{ height: '8px' }}>
                                                            <div
                                                                className={`progress-zoned-bar ${getProgressColor(ratio)}`}
                                                                style={{ width: `${Math.min(ratio, 100)}%` }}
                                                            />
                                                        </div>
                                                        <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
                                                            {ratio.toFixed(0)}% consumido
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Savings Impact Preview */}
                                <div className="impact-preview" style={{ marginTop: 'var(--spacing-lg)' }}>
                                    <div className="impact-preview-title">💡 Impacto en ahorro</div>
                                    <div className="impact-preview-row">
                                        <span>Ingresos estimados:</span>
                                        <span>{formatCurrency(currentMonthIncome)}</span>
                                    </div>
                                    <div className="impact-preview-row">
                                        <span>Presupuesto total:</span>
                                        <span>{formatCurrency(totalBudget)}</span>
                                    </div>
                                    <div className="impact-preview-row" style={{ fontWeight: 600 }}>
                                        <span>Ahorro esperado:</span>
                                        <span className={expectedSavings >= 0 ? 'text-success' : 'text-danger'}>
                                            {formatCurrency(expectedSavings)}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving}
                                    style={{ marginTop: 'var(--spacing-lg)' }}
                                >
                                    {saving ? 'Guardando...' : 'Guardar presupuestos'}
                                </button>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
