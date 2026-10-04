'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import ChartContainer from '@/components/ChartContainer';
import CustomTooltip from '@/components/charts/CustomTooltip';
import PieTooltip from '@/components/charts/PieTooltip';
import { renderPieLabel } from '@/lib/chartUtils';


import { parseAppDate, localDateKey } from '@/lib/dateUtils';
import { latestByAccount, totalLatestValue } from '@/lib/financialSnapshots';


const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function HomePage() {
    const [incomes, setIncomes] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [period, setPeriod] = useState('month');
    const [showIncomeModal, setShowIncomeModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [incomeError, setIncomeError] = useState('');
    const [expenseError, setExpenseError] = useState('');
    const [userName, setUserName] = useState(''); // Initialize empty

    // Form states for quick entry
    const [incomeForm, setIncomeForm] = useState({
        date: localDateKey(),
        amount: '',
        category: '',
        source: '',
        notes: ''
    });

    const [expenseForm, setExpenseForm] = useState({
        date: localDateKey(),
        amount: '',
        category: '',
        payment_method: 'Tarjeta',
        expense_type: 'Variable',
        notes: ''
    });



    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
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
            if ([incRes, expRes, invRes, cashRes, budRes, catRes, sessionRes].some(response => !response.ok)) {
                throw new Error('No se pudieron cargar todos los datos del panel');
            }

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
            setLoadError('No se pudieron cargar los datos financieros. Inténtalo de nuevo.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const formatTime = (dateStr) => {
        const d = parseAppDate(dateStr);
        if (!d) return dateStr;

        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return 'Hoy';
        }
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    };

    // Calculate balances
    const currentCash = useMemo(() => {
        return totalLatestValue(cashSnapshots);
    }, [cashSnapshots]);

    const currentInvestments = useMemo(() => {
        return totalLatestValue(investments);
    }, [investments]);

    const totalContributions = useMemo(() => {
        return investments.reduce((sum, i) => sum + parseFloat(i.contribution), 0);
    }, [investments]);

    const investmentGain = currentInvestments - totalContributions;
    const totalNetWorth = currentCash + currentInvestments;

    const periodInvChange = useMemo(() => {
        const now = new Date();
        const periodInvestments = investments.filter(i => {
            const d = parseAppDate(i.date);
            return d && d.getFullYear() === now.getFullYear() &&
                (period === 'year' || d.getMonth() === now.getMonth());
        });
        return periodInvestments.reduce((sum, i) => sum + parseFloat(i.contribution), 0);
    }, [investments, period]);

    const periodTotals = useMemo(() => {
        const now = new Date();
        const inPeriod = record => {
            const date = parseAppDate(record.date);
            return date && date.getFullYear() === now.getFullYear() &&
                (period === 'year' || date.getMonth() === now.getMonth());
        };
        return {
            income: incomes.filter(inPeriod).reduce((total, item) => total + Number(item.amount), 0),
            expenses: expenses.filter(inPeriod).reduce((total, item) => total + Number(item.amount), 0),
        };
    }, [incomes, expenses, period]);

    // Investment distribution by asset type
    const investmentsByType = useMemo(() => {
        const byType = {};
        Object.values(latestByAccount(investments)).forEach(inv => {
            const type = inv.asset_type || 'Otro';
            if (!byType[type]) byType[type] = 0;
            byType[type] += parseFloat(inv.current_value);
        });

        return Object.entries(byType)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [investments]);

    // Recent activity in the selected period (last 5 movements)
    const recentActivity = useMemo(() => {
        const now = new Date();
        const allMovements = [
            ...incomes.map(i => ({ ...i, type: 'income', title: i.source || i.category })),
            ...expenses.map(e => ({ ...e, type: 'expense', title: e.category }))
        ].filter(item => {
            const date = parseAppDate(item.date);
            return date && date.getFullYear() === now.getFullYear() &&
                (period === 'year' || date.getMonth() === now.getMonth());
        }).sort((a, b) => {
            const dateA = parseAppDate(a.date) || 0;
            const dateB = parseAppDate(b.date) || 0;
            return dateB - dateA;
        }).slice(0, 5);
        return allMovements;
    }, [incomes, expenses, period]);

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
        setIncomeError('');
        if (!incomeForm.amount || Number(incomeForm.amount) <= 0 || !incomeForm.category.trim()) {
            setIncomeError('Indica un importe mayor que cero y una categoría');
            return;
        }

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
            } else {
                const result = await res.json().catch(() => ({}));
                setIncomeError(result.error || 'No se pudo guardar el ingreso');
            }
        } catch (error) {
            setIncomeError('Error de conexión al guardar el ingreso');
        }
        setSaving(false);
    };

    // Handle expense submission
    const handleExpenseSubmit = async (e) => {
        e.preventDefault();
        setExpenseError('');
        if (!expenseForm.amount || Number(expenseForm.amount) <= 0 || !expenseForm.category) {
            setExpenseError('Indica un importe mayor que cero y una categoría');
            return;
        }

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
            } else {
                const result = await res.json().catch(() => ({}));
                setExpenseError(result.error || 'No se pudo guardar el gasto');
            }
        } catch (error) {
            setExpenseError('Error de conexión al guardar el gasto');
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

    if (loadError) {
        return <div className="page-container"><div className="alert alert-danger" role="alert">
            {loadError} <button className="btn btn-secondary" onClick={loadData}>Reintentar</button>
        </div></div>;
    }

    return (
        <div className="dashboard-home">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-greeting">
                    <h1>Hola, {userName} 👋</h1>
                    <p>Aquí tienes el resumen de tu dinero {period === 'month' ? 'este mes' : 'este año'}</p>
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
                        <div className="home-period-summary">
                            <div><span>Ingresos del periodo</span><strong className="text-success">{formatCurrency(periodTotals.income)}</strong></div>
                            <div><span>Gastos del periodo</span><strong className="text-danger">{formatCurrency(periodTotals.expenses)}</strong></div>
                            <div><span>Ahorro del periodo</span><strong>{formatCurrency(periodTotals.income - periodTotals.expenses)}</strong></div>
                        </div>
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
                                    <p>No hay movimientos en este periodo</p>
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
                        {periodInvChange !== 0 && (
                            <div className="premium-card-subtitle">
                                {periodInvChange >= 0 ? '+' : ''}{formatCurrency(periodInvChange)} {period === 'month' ? 'este mes' : 'este año'}
                            </div>
                        )}
                    </div>
                    <div className="premium-card-body">
                        {investmentsByType.length > 0 ? (
                            <>
                                {/* Chart using render prop with measured dimensions */}
                                <ChartContainer
                                    heightMobile={180}
                                    heightDesktop={180}
                                    render={({ width, height }) => {
                                        const size = Math.min(width, height);
                                        const outerR = size * 0.38;
                                        const innerR = size * 0.25;
                                        return (
                                            <PieChart width={width} height={height}>
                                                <Pie
                                                    data={investmentsByType}
                                                    cx={width / 2}
                                                    cy={height / 2}
                                                    innerRadius={innerR}
                                                    outerRadius={outerR}
                                                    dataKey="value"
                                                    paddingAngle={2}
                                                    labelLine={false}
                                                    label={renderPieLabel}
                                                >
                                                    {investmentsByType.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<PieTooltip />} />
                                            </PieChart>
                                        );
                                    }}

                                />
                                {/* Legend */}
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
                            </>
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
                    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="income-modal-title" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title" id="income-modal-title">💰 Nuevo ingreso</h2>
                            <button className="modal-close" aria-label="Cerrar" onClick={() => setShowIncomeModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleIncomeSubmit}>
                            <div className="modal-body">
                                {incomeError && <div className="alert alert-danger" role="alert">{incomeError}</div>}
                                <div className="form-group">
                                    <label className="form-label">Importe (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
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
                    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title" id="expense-modal-title">💸 Nuevo gasto</h2>
                            <button className="modal-close" aria-label="Cerrar" onClick={() => setShowExpenseModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleExpenseSubmit}>
                            <div className="modal-body">
                                {expenseError && <div className="alert alert-danger" role="alert">{expenseError}</div>}
                                <div className="form-group">
                                    <label className="form-label">Importe (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
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
