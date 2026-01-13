'use client';

import { useState, useEffect, useMemo } from 'react';

export default function CategoriasPage() {
    const [tab, setTab] = useState('expense');
    const [expenseCategories, setExpenseCategories] = useState([]);
    const [incomeCategories, setIncomeCategories] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [incomes, setIncomes] = useState([]);
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [expCatRes, incCatRes, expRes, incRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/categories?type=income'),
                fetch('/api/expenses'),
                fetch('/api/income'),
            ]);
            if (expCatRes.ok) setExpenseCategories(await expCatRes.json());
            if (incCatRes.ok) setIncomeCategories(await incCatRes.json());
            if (expRes.ok) setExpenses(await expRes.json());
            if (incRes.ok) setIncomes(await incRes.json());
        } catch (error) {
            console.error('Error cargando categorías:', error);
        }
        setLoading(false);
    };

    // Calculate stats per category
    const categoryStats = useMemo(() => {
        const stats = {};

        // Expense categories
        expenseCategories.forEach(cat => {
            const catExpenses = expenses.filter(e => e.category === cat.name);
            const total = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
            const months = new Set(catExpenses.map(e => {
                const d = new Date(e.date);
                return `${d.getFullYear()}-${d.getMonth()}`;
            })).size || 1;

            stats[`expense-${cat.name}`] = {
                total,
                count: catExpenses.length,
                monthlyAvg: total / months,
                pctOfTotal: 0 // Will be calculated below
            };
        });

        // Calculate total expenses for percentage
        const totalExpenses = Object.values(stats)
            .filter((_, key) => key.startsWith?.('expense'))
            .reduce((sum, s) => sum + s.total, 0);

        // Update percentages
        expenseCategories.forEach(cat => {
            if (stats[`expense-${cat.name}`]) {
                stats[`expense-${cat.name}`].pctOfTotal = totalExpenses > 0
                    ? (stats[`expense-${cat.name}`].total / totalExpenses) * 100
                    : 0;
            }
        });

        // Income categories
        incomeCategories.forEach(cat => {
            const catIncomes = incomes.filter(i => i.category === cat.name);
            const total = catIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
            const months = new Set(catIncomes.map(i => {
                const d = new Date(i.date);
                return `${d.getFullYear()}-${d.getMonth()}`;
            })).size || 1;

            stats[`income-${cat.name}`] = {
                total,
                count: catIncomes.length,
                monthlyAvg: total / months,
            };
        });

        const totalIncomes = incomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
        incomeCategories.forEach(cat => {
            if (stats[`income-${cat.name}`]) {
                stats[`income-${cat.name}`].pctOfTotal = totalIncomes > 0
                    ? (stats[`income-${cat.name}`].total / totalIncomes) * 100
                    : 0;
            }
        });

        return stats;
    }, [expenseCategories, incomeCategories, expenses, incomes]);

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
                loadData();
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
        // Check if category has movements
        const hasMovements = tab === 'expense'
            ? expenses.some(e => e.category === name)
            : incomes.some(i => i.category === name);

        if (hasMovements) {
            showMessage('error', `No se puede eliminar "${name}" porque tiene movimientos asociados`);
            return;
        }

        if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;

        try {
            const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}&type=${tab}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                showMessage('success', 'Categoría eliminada');
                loadData();
            } else {
                const data = await res.json();
                showMessage('error', data.error || 'Error al eliminar');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
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
        <div className="page-container">
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
                    Categorías de gasto ({expenseCategories.length})
                </button>
                <button
                    className={`tab ${tab === 'income' ? 'active' : ''}`}
                    onClick={() => setTab('income')}
                >
                    Categorías de ingreso ({incomeCategories.length})
                </button>
            </div>

            <div className="grid grid-2 gap-lg">
                <div className="card">
                    <div className="card-header">
                        <h3>Listado con estadísticas</h3>
                    </div>
                    <div className="card-body">
                        {categories.length === 0 ? (
                            <div className="empty-state">
                                <p className="text-muted">No hay categorías definidas</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {categories.map((cat) => {
                                    const stats = categoryStats[`${tab}-${cat.name}`];
                                    const hasMovements = stats && stats.count > 0;

                                    return (
                                        <div
                                            key={cat.id}
                                            style={{
                                                padding: '1rem',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--border-radius-sm)',
                                            }}
                                        >
                                            <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                                                <span className="font-semibold">{cat.name}</span>
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => handleDelete(cat.name)}
                                                    style={{
                                                        color: hasMovements ? 'var(--text-muted)' : 'var(--danger)',
                                                        cursor: hasMovements ? 'not-allowed' : 'pointer'
                                                    }}
                                                    title={hasMovements ? 'No se puede eliminar (tiene movimientos)' : 'Eliminar'}
                                                >
                                                    {hasMovements ? '🔒' : '🗑️'}
                                                </button>
                                            </div>
                                            {stats && (
                                                <div className="grid grid-3 gap-sm text-sm">
                                                    <div>
                                                        <div className="text-muted">Media mensual</div>
                                                        <div className="font-semibold">{formatCurrency(stats.monthlyAvg)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-muted">% del total</div>
                                                        <div className="font-semibold">{stats.pctOfTotal.toFixed(1)}%</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-muted">Movimientos</div>
                                                        <div className="font-semibold">{stats.count}</div>
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

                        <div className="alert alert-info" style={{ marginTop: 'var(--spacing-lg)' }}>
                            <strong>💡 Consejo:</strong> Las categorías con movimientos asociados no se pueden eliminar.
                            Primero deberás eliminar o reasignar los movimientos.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
