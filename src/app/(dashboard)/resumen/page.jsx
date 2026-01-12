'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export default function ResumenPage() {
    const [incomes, setIncomes] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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

    // Filtrar por año
    const filteredIncomes = incomes.filter((i) => new Date(i.date).getFullYear() === selectedYear);
    const filteredExpenses = expenses.filter((e) => new Date(e.date).getFullYear() === selectedYear);

    // KPIs
    const totalIncome = filteredIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const savings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

    // Presupuesto anual
    const monthlyBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_amount || 0), 0);
    const yearlyBudget = monthlyBudget * 12;
    const budgetRatio = yearlyBudget > 0 ? (totalExpenses / yearlyBudget) * 100 : 0;

    // Datos por mes para gráfico de ahorro
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyData = monthNames.map((name, idx) => {
        const monthIncomes = filteredIncomes.filter((i) => new Date(i.date).getMonth() === idx);
        const monthExpenses = filteredExpenses.filter((e) => new Date(e.date).getMonth() === idx);
        const inc = monthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const exp = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        return { name, income: inc, expenses: exp, savings: inc - exp };
    }).filter((d) => d.income > 0 || d.expenses > 0);

    // Datos por categoría (gastos)
    const expenseByCategory = {};
    filteredExpenses.forEach((e) => {
        if (!expenseByCategory[e.category]) expenseByCategory[e.category] = 0;
        expenseByCategory[e.category] += parseFloat(e.amount);
    });
    const categoryData = Object.entries(expenseByCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Gasto fijo vs variable
    const expenseByType = { Fijo: 0, Variable: 0 };
    filteredExpenses.forEach((e) => {
        const type = e.expense_type || 'Variable';
        expenseByType[type] = (expenseByType[type] || 0) + parseFloat(e.amount);
    });
    const typeData = Object.entries(expenseByType).map(([name, value]) => ({ name, value }));

    // Años disponibles
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
        <div>
            <div className="page-header flex-between">
                <div>
                    <h1 className="page-title">Resumen de finanzas</h1>
                    <p className="page-subtitle">Vista general de tus ingresos, gastos y ahorro</p>
                </div>
                <select
                    className="form-input form-select"
                    style={{ width: '150px' }}
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                >
                    {allYears.length > 0 ? allYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                    )) : <option>{new Date().getFullYear()}</option>}
                </select>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-label">Ingresos {selectedYear}</div>
                    <div className="kpi-value text-success">{formatCurrency(totalIncome)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Gastos {selectedYear}</div>
                    <div className="kpi-value text-danger">{formatCurrency(totalExpenses)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Ahorro {selectedYear}</div>
                    <div className={`kpi-value ${savings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                        {formatCurrency(savings)}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Tasa de ahorro</div>
                    <div className={`kpi-value ${savingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                        {savingsRate.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Presupuesto vs Gasto */}
            {yearlyBudget > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 style={{ marginBottom: '1rem' }}>Presupuesto vs gasto real</h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuesto anual</div>
                                <div className="font-semibold">{formatCurrency(yearlyBudget)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gasto real</div>
                                <div className="font-semibold">{formatCurrency(totalExpenses)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">% consumido</div>
                                <div className="font-semibold">{budgetRatio.toFixed(1)}%</div>
                            </div>
                        </div>
                        <div className="progress" style={{ height: '12px' }}>
                            <div
                                className={`progress-bar ${budgetRatio > 100 ? 'danger' : budgetRatio > 80 ? 'warning' : ''}`}
                                style={{ width: `${Math.min(budgetRatio, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Gráfico de ahorro mensual */}
            {monthlyData.length > 0 && (
                <div className="chart-container">
                    <h3 className="chart-title">Evolución mensual del ahorro</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="name" stroke="var(--text-tertiary)" />
                            <YAxis stroke="var(--text-tertiary)" />
                            <Tooltip
                                formatter={(value) => formatCurrency(value)}
                                contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                            />
                            <Bar dataKey="savings" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-2 gap-lg">
                {/* Gasto por categoría */}
                {categoryData.length > 0 && (
                    <div className="chart-container">
                        <h3 className="chart-title">Gastos por categoría</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {categoryData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Fijo vs Variable */}
                {typeData.length > 0 && (
                    <div className="chart-container">
                        <h3 className="chart-title">Gasto fijo vs variable</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={typeData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    <Cell fill="#3B82F6" />
                                    <Cell fill="#10B981" />
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}
