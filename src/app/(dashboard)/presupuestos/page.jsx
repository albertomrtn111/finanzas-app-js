'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { compareBudgets, toCents } from '@/lib/personalSummary';
import { formatPct } from '@/lib/moneyFormat';

export default function PresupuestosPage() {
    const [categories, setCategories] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Gasto e ingresos del mes en curso: los calcula el servidor con el mismo módulo que Resumen y el MCP.
            const now = new Date();
            const params = new URLSearchParams({ period: 'month', year: String(now.getFullYear()), month: String(now.getMonth()) });
            const [catRes, budRes, sumRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/budgets'),
                fetch(`/api/summary?${params.toString()}`),
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
            if (sumRes.ok) setSummary(await sumRes.json());
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

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

    // Gasto del mes por categoría (en céntimos) tal como lo devuelve el servidor.
    const spentByCategory = useMemo(() => new Map(
        (summary?.charts?.categories ?? []).map(c => [c.name, toCents(c.value)])
    ), [summary]);
    const spentOf = (name) => (spentByCategory.get(name) || 0) / 100;

    // Misma comparación que Resumen y el MCP, aplicada a los importes que se están editando:
    // solo cuentan las categorías con presupuesto; el resto se muestra como gasto sin presupuesto.
    const comparison = useMemo(() => compareBudgets({
        budgets: Object.entries(budgets).map(([category, monthly_amount]) => ({ category, monthly_amount })),
        spent: spentByCategory,
        months: 1,
    }), [budgets, spentByCategory]);

    const totalBudget = comparison.total;
    const totalSpent = comparison.spent;
    const currentMonthIncome = summary?.kpi?.income ?? 0;
    const expectedSavings = currentMonthIncome - totalBudget;

    // Categorías con presupuesto que van por encima del 70 %.
    const categoriesAtRisk = comparison.categories
        .filter(cat => (cat.ratio ?? 0) >= 70)
        .map(cat => ({ name: cat.category, budget: cat.budget, spent: cat.spent, ratio: cat.ratio ?? 0 }));

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
                            <div className="kpi-label">Gastado en categorías con presupuesto</div>
                            <div className="kpi-value text-danger">{formatCurrency(totalSpent)}</div>
                            <div className="kpi-trend">
                                <span className={totalSpent <= totalBudget ? 'text-success' : 'text-danger'}>
                                    {formatPct(comparison.ratio ?? 0)} del presupuesto
                                </span>
                            </div>
                            {comparison.unbudgetedSpent !== 0 && (
                                <div className="text-muted text-sm">
                                    Además, {formatCurrency(comparison.unbudgetedSpent)} en categorías sin presupuesto
                                </div>
                            )}
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
                                                    {formatCurrency(cat.spent)} de {formatCurrency(cat.budget)} ({formatPct(cat.ratio)})
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
                                        const spent = spentOf(cat.name);
                                        const ratio = comparison.categories.find(c => c.category === cat.name)?.ratio ?? 0;

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
                                                            {formatPct(ratio)} consumido
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
