'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export default function ResumenPage() {
    const [incomes, setIncomes] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [incRes, expRes, budRes] = await Promise.all([
                fetch('/api/income'),
                fetch('/api/expenses'),
                fetch('/api/budgets'),
            ]);
            if (incRes.ok) setIncomes(await incRes.json());
            if (expRes.ok) setExpenses(await expRes.json());
            if (budRes.ok) setBudgets(await budRes.json());
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    // Current month data
    const isCurrentMonth = selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth();

    // Filter by year
    const filteredIncomes = incomes.filter((i) => new Date(i.date).getFullYear() === selectedYear);
    const filteredExpenses = expenses.filter((e) => new Date(e.date).getFullYear() === selectedYear);

    // Selected month data for status  
    const currentMonthIncomes = filteredIncomes.filter((i) => new Date(i.date).getMonth() === selectedMonth);
    const currentMonthExpenses = filteredExpenses.filter((e) => new Date(e.date).getMonth() === selectedMonth);

    // Previous month data for trends
    const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const prevMonthIncomes = incomes.filter((i) => {
        const d = new Date(i.date);
        return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });
    const prevMonthExpenses = expenses.filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
    });

    // Month names
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // KPIs - Year totals
    const totalIncome = filteredIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const savings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

    // KPIs - Current month
    const monthIncome = currentMonthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const monthExpenses = currentMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const monthSavings = monthIncome - monthExpenses;

    // Previous month totals for trends
    const prevMonthIncome = prevMonthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const prevMonthExpense = prevMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const prevMonthSaving = prevMonthIncome - prevMonthExpense;

    // Calculate trends
    const incomeTrend = prevMonthIncome > 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : 0;
    const expenseTrend = prevMonthExpense > 0 ? ((monthExpenses - prevMonthExpense) / prevMonthExpense) * 100 : 0;
    const savingsTrend = prevMonthSaving !== 0 ? ((monthSavings - prevMonthSaving) / Math.abs(prevMonthSaving)) * 100 : 0;

    // Monthly budget
    const monthlyBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_amount || 0), 0);
    const yearlyBudget = monthlyBudget * 12;
    const monthBudgetRatio = monthlyBudget > 0 ? (monthExpenses / monthlyBudget) * 100 : 0;
    const yearBudgetRatio = yearlyBudget > 0 ? (totalExpenses / yearlyBudget) * 100 : 0;

    // Calculate financial status
    const getFinancialStatus = () => {
        if (monthBudgetRatio > 90 || monthSavings < 0) {
            return { status: 'danger', label: 'Excedido', desc: 'Gastos por encima del presupuesto' };
        }
        if (monthBudgetRatio > 70 || (savingsRate > 0 && savingsRate < 10)) {
            return { status: 'warning', label: 'Riesgo', desc: 'Acercándote al límite' };
        }
        return { status: 'success', label: 'Bajo control', desc: 'Finanzas saludables' };
    };

    const financialStatus = getFinancialStatus();

    // Projected end-of-month expenses
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const projectedExpenses = isCurrentMonth && dayOfMonth > 0
        ? (monthExpenses / dayOfMonth) * daysInMonth
        : monthExpenses;

    // Progress bar color
    const getProgressColor = (ratio) => {
        if (ratio > 90) return 'red';
        if (ratio > 70) return 'yellow';
        return 'green';
    };

    // Smart Alerts
    const generateSmartAlerts = () => {
        const alerts = [];

        // Calculate average expense by category
        const expenseByCategory = {};
        const historicalExpenseByCategory = {};

        filteredExpenses.forEach((e) => {
            if (!expenseByCategory[e.category]) expenseByCategory[e.category] = 0;
            expenseByCategory[e.category] += parseFloat(e.amount);
        });

        // Current month by category
        const currentMonthByCategory = {};
        currentMonthExpenses.forEach((e) => {
            if (!currentMonthByCategory[e.category]) currentMonthByCategory[e.category] = 0;
            currentMonthByCategory[e.category] += parseFloat(e.amount);
        });

        // Calculate historical monthly average
        const monthsWithData = new Set(filteredExpenses.map(e => new Date(e.date).getMonth())).size || 1;

        Object.entries(currentMonthByCategory).forEach(([category, amount]) => {
            const avgMonthly = (expenseByCategory[category] || 0) / monthsWithData;
            if (avgMonthly > 0 && amount > avgMonthly * 1.3) {
                const pctOver = ((amount - avgMonthly) / avgMonthly * 100).toFixed(0);
                alerts.push({
                    type: 'warning',
                    icon: '⚠️',
                    title: `Gasto elevado en ${category}`,
                    desc: `${pctOver}% más que tu media mensual (${formatCurrency(avgMonthly)})`
                });
            }
        });

        // Investment capacity
        if (monthSavings > 0 && monthlyBudget > 0) {
            const safeToInvest = monthSavings * 0.7; // Keep 30% as buffer
            if (safeToInvest > 100) {
                alerts.push({
                    type: 'success',
                    icon: '💡',
                    title: 'Capacidad de inversión',
                    desc: `Puedes invertir hasta ${formatCurrency(safeToInvest)} sin comprometer tu ahorro`
                });
            }
        }

        // Budget at risk
        if (monthBudgetRatio > 70 && monthBudgetRatio < 100) {
            alerts.push({
                type: 'warning',
                icon: '📊',
                title: 'Presupuesto en riesgo',
                desc: `Has consumido el ${monthBudgetRatio.toFixed(0)}% del presupuesto mensual`
            });
        }

        // Good savings rate
        if (savingsRate > 20) {
            alerts.push({
                type: 'success',
                icon: '🎯',
                title: 'Excelente tasa de ahorro',
                desc: `Estás ahorrando el ${savingsRate.toFixed(0)}% de tus ingresos`
            });
        }

        return alerts.slice(0, 4); // Max 4 alerts
    };

    const smartAlerts = generateSmartAlerts();

    // Data for monthly chart
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyData = monthNamesShort.map((name, idx) => {
        const monthIncomes = filteredIncomes.filter((i) => new Date(i.date).getMonth() === idx);
        const monthExpenses = filteredExpenses.filter((e) => new Date(e.date).getMonth() === idx);
        const inc = monthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const exp = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        return { name, income: inc, expenses: exp, savings: inc - exp };
    }).filter((d) => d.income > 0 || d.expenses > 0);

    // Savings target line (average monthly savings goal)
    const avgMonthlySavingsTarget = monthlyBudget > 0
        ? (monthIncome - monthlyBudget)
        : monthSavings;

    // Category data
    const expenseByCategory = {};
    filteredExpenses.forEach((e) => {
        if (!expenseByCategory[e.category]) expenseByCategory[e.category] = 0;
        expenseByCategory[e.category] += parseFloat(e.amount);
    });
    const categoryData = Object.entries(expenseByCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Fixed vs Variable
    const expenseByType = { Fijo: 0, Variable: 0 };
    filteredExpenses.forEach((e) => {
        const type = e.expense_type || 'Variable';
        expenseByType[type] = (expenseByType[type] || 0) + parseFloat(e.amount);
    });
    const typeData = Object.entries(expenseByType).map(([name, value]) => ({ name, value }));

    // Available years
    const allYears = [...new Set([
        ...incomes.map((i) => new Date(i.date).getFullYear()),
        ...expenses.map((e) => new Date(e.date).getFullYear()),
    ])].sort((a, b) => b - a);

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Status Header */}
            <div className="status-header">
                <div>
                    <div className="status-header-title">Estado financiero de este mes</div>
                    <div className="status-header-subtitle">{financialStatus.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className={`status-badge ${financialStatus.status}`}>
                        <span className="status-badge-icon"></span>
                        {financialStatus.label}
                    </div>
                    <select
                        className="form-input form-select"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    >
                        {allYears.length > 0 ? allYears.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        )) : <option>{new Date().getFullYear()}</option>}
                    </select>
                    <select
                        className="form-input form-select"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                    >
                        {monthNames.map((name, idx) => (
                            <option key={idx} value={idx}>{name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Enhanced KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ingresos (este mes)</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-success">{formatCurrency(monthIncome)}</div>
                    </div>
                    {prevMonthIncome > 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${incomeTrend >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(incomeTrend).toFixed(0)}% vs mes anterior
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Gastos (este mes)</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-danger">{formatCurrency(monthExpenses)}</div>
                    </div>
                    {prevMonthExpense > 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${expenseTrend <= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(expenseTrend).toFixed(0)}% vs mes anterior
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ahorro (este mes)</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${monthSavings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {formatCurrency(monthSavings)}
                        </div>
                    </div>
                    {prevMonthSaving !== 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${savingsTrend >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(savingsTrend).toFixed(0)}% vs mes anterior
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Tasa de ahorro ({selectedYear})</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${savingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {savingsRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="kpi-trend">
                        <span className="text-muted text-sm">
                            Ahorro total: {formatCurrency(savings)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Budget Progress with Zones */}
            {monthlyBudget > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">Presupuesto mensual</h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuesto</div>
                                <div className="font-semibold">{formatCurrency(monthlyBudget)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gastado</div>
                                <div className="font-semibold">{formatCurrency(monthExpenses)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Disponible</div>
                                <div className={`font-semibold ${monthlyBudget - monthExpenses >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatCurrency(monthlyBudget - monthExpenses)}
                                </div>
                            </div>
                        </div>
                        <div className="progress-zoned">
                            <div
                                className={`progress-zoned-bar ${getProgressColor(monthBudgetRatio)}`}
                                style={{ width: `${Math.min(monthBudgetRatio, 100)}%` }}
                            />
                        </div>
                        <div className="projection-text">
                            📈 Si mantienes este ritmo, cerrarás el mes con un gasto de {formatCurrency(projectedExpenses)}
                            {projectedExpenses > monthlyBudget && (
                                <span className="text-danger"> (superarás el presupuesto)</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Smart Alerts */}
            {smartAlerts.length > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">💡 Alertas inteligentes</h3>
                        <div className="smart-alerts">
                            {smartAlerts.map((alert, idx) => (
                                <div key={idx} className={`smart-alert ${alert.type}`}>
                                    <span className="smart-alert-icon">{alert.icon}</span>
                                    <div className="smart-alert-content">
                                        <div className="smart-alert-title">{alert.title}</div>
                                        <div className="smart-alert-desc">{alert.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Monthly Savings Chart with Target Line */}
            {monthlyData.length > 0 && (
                <div className="chart-container chart-bar">
                    <h3 className="chart-title">Evolución mensual del ahorro</h3>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                            data={monthlyData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="name"
                                stroke="var(--text-tertiary)"
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="var(--text-tertiary)"
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                width={40}
                            />
                            <Tooltip
                                formatter={(value) => formatCurrency(value)}
                                contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                            />
                            <ReferenceLine
                                y={avgMonthlySavingsTarget}
                                stroke={avgMonthlySavingsTarget > 0 ? "#10B981" : "#EF4444"}
                                strokeDasharray="5 5"
                            />
                            <Bar
                                dataKey="savings"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={60}
                            >
                                {monthlyData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.savings >= 0 ? '#3B82F6' : '#EF4444'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-2 gap-lg">
                {/* Category Chart */}
                {categoryData.length > 0 && (
                    <div className="chart-container chart-pie">
                        <h3 className="chart-title">Gastos por categoría ({selectedYear})</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={40}
                                    outerRadius={70}
                                    dataKey="value"
                                    labelLine={false}
                                >
                                    {categoryData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                <Legend
                                    layout="horizontal"
                                    verticalAlign="bottom"
                                    align="center"
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Fixed vs Variable */}
                {typeData.length > 0 && (
                    <div className="chart-container chart-pie">
                        <h3 className="chart-title">Gasto fijo vs variable ({selectedYear})</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={typeData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={40}
                                    outerRadius={70}
                                    dataKey="value"
                                    labelLine={false}
                                >
                                    <Cell fill="#3B82F6" />
                                    <Cell fill="#10B981" />
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                <Legend
                                    layout="horizontal"
                                    verticalAlign="bottom"
                                    align="center"
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Year Summary */}
            <div className="card mt-lg">
                <div className="card-header">
                    <h3>Resumen anual {selectedYear}</h3>
                </div>
                <div className="card-body">
                    <div className="grid grid-4 gap-md">
                        <div>
                            <div className="text-muted text-sm">Total ingresos</div>
                            <div className="font-semibold text-success">{formatCurrency(totalIncome)}</div>
                        </div>
                        <div>
                            <div className="text-muted text-sm">Total gastos</div>
                            <div className="font-semibold text-danger">{formatCurrency(totalExpenses)}</div>
                        </div>
                        <div>
                            <div className="text-muted text-sm">Ahorro neto</div>
                            <div className={`font-semibold ${savings >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(savings)}
                            </div>
                        </div>
                        <div>
                            <div className="text-muted text-sm">% presupuesto usado</div>
                            <div className={`font-semibold ${yearBudgetRatio > 100 ? 'text-danger' : yearBudgetRatio > 80 ? 'text-warning' : ''}`}>
                                {yearBudgetRatio.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
