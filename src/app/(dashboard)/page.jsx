'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import ChartContainer from '@/components/ChartContainer';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function HomePage() {
    const [incomes, setIncomes] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('month');
    const [showIncomeModal, setShowIncomeModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [userName, setUserName] = useState('Alberto'); // Default fallback

    // Form states for quick entry
    const [incomeForm, setIncomeForm] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: '',
        source: '',
        notes: ''
    });

    const [expenseForm, setExpenseForm] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: '',
        payment_method: 'Tarjeta',
        expense_type: 'Variable',
        notes: ''
    });

    useEffect(() => {
        loadData();
    }, []);



    const loadData = async () => {
        setLoading(true);
        try {
            const [incRes, expRes, invRes, cashRes, budRes, catRes, sessionRes] = await Promise.all([
                fetch('/api/income'),
                fetch('/api/expenses'),
                fetch('/api/investments'),
                fetch('/api/cash'),
                fetch('/api/budgets'),
                fetch('/api/categories?type=expense'),
                fetch('/api/auth/session'),
            ]);

            if (incRes.ok) {
                const data = await incRes.json();
                setIncomes(Array.isArray(data) ? data : []);
            }
            if (expRes.ok) {
                const data = await expRes.json();
                setExpenses(Array.isArray(data) ? data : []);
            }
            if (invRes.ok) {
                const data = await invRes.json();
                setInvestments(Array.isArray(data) ? data : []);
            }
            if (cashRes.ok) {
                const data = await cashRes.json();
                setCashSnapshots(Array.isArray(data) ? data : []);
            }
            if (budRes.ok) {
                const data = await budRes.json();
                setBudgets(Array.isArray(data) ? data : []);
            }
            if (catRes.ok) {
                const data = await catRes.json();
                setCategories(Array.isArray(data) ? data : []);
            }
            if (sessionRes.ok) {
                const session = await sessionRes.json();
                if (session?.user?.name) {
                    setUserName(session.user.name);
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    // Calculate balances
    const currentCash = useMemo(() => {
        const byAccount = {};
        cashSnapshots.forEach(snap => {
            if (!byAccount[snap.account] || new Date(snap.date) > new Date(byAccount[snap.account].date)) {
                byAccount[snap.account] = snap;
            }
        });
        return Object.values(byAccount).reduce((sum, s) => sum + parseFloat(s.current_value), 0);
    }, [cashSnapshots]);

    const currentInvestments = useMemo(() => {
        const byAccount = {};
        investments.forEach(inv => {
            if (!byAccount[inv.account] || new Date(inv.date) > new Date(byAccount[inv.account].date)) {
                byAccount[inv.account] = inv;
            }
        });
        return Object.values(byAccount).reduce((sum, i) => sum + parseFloat(i.current_value), 0);
    }, [investments]);

    const totalContributions = useMemo(() => {
        return investments.reduce((sum, i) => sum + parseFloat(i.contribution), 0);
    }, [investments]);

    const investmentGain = currentInvestments - totalContributions;
    const totalNetWorth = currentCash + currentInvestments;

    // This month's investment change
    const thisMonthInvChange = useMemo(() => {
        const now = new Date();
        const thisMonth = investments.filter(i => {
            const d = new Date(i.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        return thisMonth.reduce((sum, i) => sum + parseFloat(i.contribution), 0);
    }, [investments]);

    // Investment distribution by asset type
    const investmentsByType = useMemo(() => {
        const byAccount = {};
        investments.forEach(inv => {
            if (!byAccount[inv.account] || new Date(inv.date) > new Date(byAccount[inv.account].date)) {
                byAccount[inv.account] = inv;
            }
        });

        const byType = {};
        Object.values(byAccount).forEach(inv => {
            const type = inv.asset_type || 'Otro';
            if (!byType[type]) byType[type] = 0;
            byType[type] += parseFloat(inv.current_value);
        });

        return Object.entries(byType)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [investments]);

    // Recent activity (last 5 movements)
    const recentActivity = useMemo(() => {
        const allMovements = [
            ...incomes.map(i => ({ ...i, type: 'income', title: i.source || i.category })),
            ...expenses.map(e => ({ ...e, type: 'expense', title: e.category }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        return allMovements;
    }, [incomes, expenses]);

    // Emergency fund goal (using total budget as target, cash as current)
    const emergencyFundGoal = useMemo(() => {
        const monthlyBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_amount || 0), 0);
        const targetMonths = 6;
        const target = monthlyBudget * targetMonths;
        const current = currentCash;
        const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
        return { current, target, percentage };
    }, [budgets, currentCash]);

    // Handle income submission
    const handleIncomeSubmit = async (e) => {
        e.preventDefault();
        if (!incomeForm.amount || !incomeForm.category) return;

        setSaving(true);
        try {
            const res = await fetch('/api/income', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(incomeForm)
            });
            if (res.ok) {
                setShowIncomeModal(false);
                setIncomeForm({ ...incomeForm, amount: '', notes: '' });
                loadData();
            }
        } catch (error) {
            console.error('Error:', error);
        }
        setSaving(false);
    };

    // Handle expense submission
    const handleExpenseSubmit = async (e) => {
        e.preventDefault();
        if (!expenseForm.amount || !expenseForm.category) return;

        setSaving(true);
        try {
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expenseForm)
            });
            if (res.ok) {
                setShowExpenseModal(false);
                setExpenseForm({ ...expenseForm, amount: '', notes: '' });
                loadData();
            }
        } catch (error) {
            console.error('Error:', error);
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="dashboard-home">
                <div className="flex-center" style={{ minHeight: '400px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-home">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-greeting">
                    <h1>Hola, {userName} 👋</h1>
                    <p>Aquí tienes el resumen de tu dinero este mes</p>
                    <div className="dashboard-meta">
                        Última actualización: hoy {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                <div className="dashboard-actions">
                    <select
                        className="period-selector"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                    >
                        <option value="month">Este mes</option>
                        <option value="year">Año actual</option>
                    </select>
                    <button className="header-icon-btn" title="Notificaciones">🔔</button>
                </div>
            </div>

            {/* Three Main Cards */}
            <div className="dashboard-cards">
                {/* Card 1: Balance Total */}
                <div className="premium-card">
                    <div className="premium-card-header">
                        <div className="premium-card-title">Balance total</div>
                        <div className="premium-card-value">{formatCurrency(currentCash)}</div>
                        <div className="premium-card-subtitle">Disponible en cuentas</div>
                    </div>
                    <div className="premium-card-body">
                        <div className="quick-actions">
                            <button
                                className="quick-action-btn income"
                                onClick={() => setShowIncomeModal(true)}
                            >
                                <span>+</span> Ingreso
                            </button>
                            <button
                                className="quick-action-btn expense"
                                onClick={() => setShowExpenseModal(true)}
                            >
                                <span>−</span> Gasto
                            </button>
                        </div>

                        <div style={{ marginTop: 'var(--spacing-lg)' }}>
                            {recentActivity.length === 0 ? (
                                <div className="empty-activity">
                                    <div className="empty-activity-icon">📝</div>
                                    <p>No hay movimientos recientes</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {recentActivity.map((item, idx) => (
                                        <div key={idx} className="activity-item">
                                            <div className={`activity-icon ${item.type}`}>
                                                {item.type === 'income' ? '↓' : '↑'}
                                            </div>
                                            <div className="activity-details">
                                                <div className="activity-title">{item.title}</div>
                                                <div className="activity-meta">{formatTime(item.date)}</div>
                                            </div>
                                            <div className={`activity-amount ${item.type}`}>
                                                {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="premium-card-footer">
                        <Link href="/resumen" className="view-all-link">
                            Ver todos <span>→</span>
                        </Link>
                    </div>
                </div>

                {/* Card 2: Inversiones */}
                <div className="premium-card">
                    <div className="premium-card-header">
                        <div className="premium-card-title">Inversiones</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)' }}>
                            <span className="premium-card-value">{formatCurrency(currentInvestments)}</span>
                            <span className={`premium-card-change ${investmentGain >= 0 ? 'positive' : 'negative'}`}>
                                {investmentGain >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(investmentGain))}
                            </span>
                        </div>
                        {thisMonthInvChange !== 0 && (
                            <div className="premium-card-subtitle">
                                {thisMonthInvChange >= 0 ? '+' : ''}{formatCurrency(thisMonthInvChange)} este mes
                            </div>
                        )}
                    </div>
                    <div className="premium-card-body">
                        {investmentsByType.length > 0 ? (
                            <div className="donut-container">
                                <ChartContainer heightMobile={180} heightDesktop={180}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={investmentsByType}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={45}
                                                outerRadius={70}
                                                dataKey="value"
                                                paddingAngle={2}
                                            >
                                                {investmentsByType.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                                <div className="donut-legend">
                                    {investmentsByType.map((item, idx) => (
                                        <div key={idx} className="legend-item">
                                            <div className="legend-dot" style={{ background: COLORS[idx % COLORS.length] }}></div>
                                            <span className="legend-label">{item.name}</span>
                                            <span className="legend-value">
                                                {currentInvestments > 0
                                                    ? ((item.value / currentInvestments) * 100).toFixed(0)
                                                    : 0}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-activity">
                                <div className="empty-activity-icon">📈</div>
                                <p>Sin inversiones registradas</p>
                            </div>
                        )}
                    </div>
                    <div className="premium-card-footer">
                        <Link href="/inversiones/resumen" className="view-all-link">
                            Ir a cartera <span>→</span>
                        </Link>
                    </div>
                </div>

                {/* Card 3: Patrimonio Neto */}
                <div className="premium-card">
                    <div className="premium-card-header">
                        <div className="premium-card-title">Patrimonio neto</div>
                        <div className="premium-card-value">{formatCurrency(totalNetWorth)}</div>
                    </div>
                    <div className="premium-card-body">
                        <div className="networth-breakdown">
                            <div className="networth-item">
                                <div className="networth-label">Activos</div>
                                <div className="networth-value assets">{formatCurrency(totalNetWorth)}</div>
                            </div>
                            <div className="networth-item">
                                <div className="networth-label">Pasivos</div>
                                <div className="networth-value liabilities">{formatCurrency(0)}</div>
                            </div>
                        </div>

                        {emergencyFundGoal.target > 0 && (
                            <div className="goal-section">
                                <div className="goal-header">
                                    <div className="goal-title">🛡️ Fondo de emergencia</div>
                                    <div className="goal-percentage">{emergencyFundGoal.percentage.toFixed(0)}%</div>
                                </div>
                                <div className="goal-progress-bar">
                                    <div
                                        className="goal-progress-fill"
                                        style={{ width: `${emergencyFundGoal.percentage}%` }}
                                    ></div>
                                </div>
                                <div className="goal-text">
                                    Has ahorrado {formatCurrency(emergencyFundGoal.current)} de {formatCurrency(emergencyFundGoal.target)}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="premium-card-footer">
                        <Link href="/patrimonio" className="view-all-link">
                            Actualizar activos <span>→</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Income Modal */}
            {showIncomeModal && (
                <div className="modal-overlay" onClick={() => setShowIncomeModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">💰 Nuevo ingreso</h2>
                            <button className="modal-close" onClick={() => setShowIncomeModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleIncomeSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Importe (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="form-input"
                                        placeholder="0.00"
                                        value={incomeForm.amount}
                                        onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Categoría</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="ej: Nómina, Freelance..."
                                        value={incomeForm.category}
                                        onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fuente (opcional)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="ej: Empresa ABC"
                                        value={incomeForm.source}
                                        onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={incomeForm.date}
                                        onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowIncomeModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar ingreso'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Expense Modal */}
            {showExpenseModal && (
                <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">💸 Nuevo gasto</h2>
                            <button className="modal-close" onClick={() => setShowExpenseModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleExpenseSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Importe (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="form-input"
                                        placeholder="0.00"
                                        value={expenseForm.amount}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Categoría</label>
                                    <select
                                        className="form-input form-select"
                                        value={expenseForm.category}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                    >
                                        <option value="">Selecciona categoría</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-2 gap-md">
                                    <div className="form-group">
                                        <label className="form-label">Método de pago</label>
                                        <select
                                            className="form-input form-select"
                                            value={expenseForm.payment_method}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                                        >
                                            <option value="Tarjeta">Tarjeta</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Bizum">Bizum</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Tipo</label>
                                        <select
                                            className="form-input form-select"
                                            value={expenseForm.expense_type}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}
                                        >
                                            <option value="Variable">Variable</option>
                                            <option value="Fijo">Fijo</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={expenseForm.date}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowExpenseModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar gasto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
