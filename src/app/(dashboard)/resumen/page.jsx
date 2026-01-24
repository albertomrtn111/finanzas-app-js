'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import ChartContainer from '@/components/ChartContainer';
import CustomTooltip from '@/components/charts/CustomTooltip';
import PieTooltip from '@/components/charts/PieTooltip';
import { renderPieLabel } from '@/lib/chartUtils';
import { parseAppDate } from '@/lib/dateUtils';


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

    // Dev warning for invalid dates
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" && !loading) {
            const invalidInc = incomes.filter(i => !parseAppDate(i.date)).length;
            const invalidExp = expenses.filter(i => !parseAppDate(i.date)).length;
            if (invalidInc + invalidExp > 0) {
                console.warn(`[Resumen] Invalid dates found: Incomes(${invalidInc}), Expenses(${invalidExp})`);
            }
        }
    }, [incomes, expenses, loading]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    // View State
    const isYearView = selectedMonth === -1;

    // Current month/year check (for projections)
    const isCurrentPeriod = isYearView
        ? selectedYear === new Date().getFullYear()
        : (selectedYear === new Date().getFullYear() && selectedMonth === new Date().getMonth());

    // Helper for safe date extraction
    const getYear = (dateStr) => {
        const d = parseAppDate(dateStr);
        return d ? d.getFullYear() : null;
    };

    const getMonth = (dateStr) => {
        const d = parseAppDate(dateStr);
        return d ? d.getMonth() : null;
    };

    // Filter by year
    const filteredIncomes = incomes.filter((i) => getYear(i.date) === selectedYear);
    const filteredExpenses = expenses.filter((e) => getYear(e.date) === selectedYear);

    // Filter by Month (if not year view)
    const currentMonthIncomes = isYearView ? filteredIncomes : filteredIncomes.filter((i) => getMonth(i.date) === selectedMonth);
    const currentMonthExpenses = isYearView ? filteredExpenses : filteredExpenses.filter((e) => getMonth(e.date) === selectedMonth);

    // PREVIOUS PERIOD DATA (for trends)
    // If Month View: Previous Month. If Year View: Previous Year.
    const prevPeriodRecalculated = (() => {
        if (isYearView) {
            const prevYear = selectedYear - 1;
            const pIncomes = incomes.filter(i => getYear(i.date) === prevYear);
            const pExpenses = expenses.filter(e => getYear(e.date) === prevYear);
            return {
                income: pIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0),
                expense: pExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
            };
        } else {
            const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
            const prevMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
            const pIncomes = incomes.filter((i) => {
                const d = parseAppDate(i.date);
                if (!d) return false;
                return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
            });
            const pExpenses = expenses.filter((e) => {
                const d = parseAppDate(e.date);
                if (!d) return false;
                return d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear;
            });
            return {
                income: pIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0),
                expense: pExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
            };
        }
    })();

    const prevPeriodSaving = prevPeriodRecalculated.income - prevPeriodRecalculated.expense;

    // KPI CALCULATIONS (Displayed)
    const displayedIncome = currentMonthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const displayedExpenses = currentMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const displayedSavings = displayedIncome - displayedExpenses;
    const displayedSavingsRate = displayedIncome > 0 ? (displayedSavings / displayedIncome) * 100 : 0;

    // Trends Calculation
    const incomeTrend = prevPeriodRecalculated.income > 0
        ? ((displayedIncome - prevPeriodRecalculated.income) / prevPeriodRecalculated.income) * 100
        : 0;
    const expenseTrend = prevPeriodRecalculated.expense > 0
        ? ((displayedExpenses - prevPeriodRecalculated.expense) / prevPeriodRecalculated.expense) * 100
        : 0;
    const savingsTrend = prevPeriodSaving !== 0
        ? ((displayedSavings - prevPeriodSaving) / Math.abs(prevPeriodSaving)) * 100
        : 0;

    // BUDGET LOGIC
    const monthlyBudgetBase = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_amount || 0), 0);
    const displayedBudget = isYearView ? monthlyBudgetBase * 12 : monthlyBudgetBase;

    // Budget usage ratio
    const budgetUsageRatio = displayedBudget > 0 ? (displayedExpenses / displayedBudget) * 100 : 0;

    // Constants Labels
    const periodLabel = isYearView ? `(${selectedYear})` : '(este mes)';
    const trendLabel = isYearView ? 'vs año anterior' : 'vs mes anterior';

    // Month names
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Calculate financial status (Reused logic but adapted)
    const getFinancialStatus = () => {
        if (budgetUsageRatio > 100 || (isYearView ? displayedSavings < 0 : displayedSavings < 0)) { // Simple check
            return { status: 'danger', label: 'Excedido', desc: 'Gastos por encima del presupuesto' };
        }
        if (budgetUsageRatio > (isYearView ? 90 : 70) || (displayedSavingsRate > 0 && displayedSavingsRate < 10)) {
            return { status: 'warning', label: 'Riesgo', desc: 'Acercándote al límite' };
        }
        return { status: 'success', label: 'Bajo control', desc: 'Finanzas saludables' };
    };

    const financialStatus = getFinancialStatus();

    // Projected expenses (Only for current Month view, hidden/simplified for Year view)
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const projectedExpenses = (!isYearView && isCurrentPeriod && dayOfMonth > 0)
        ? (displayedExpenses / dayOfMonth) * daysInMonth
        : displayedExpenses;

    const getProgressColor = (ratio) => {
        if (ratio > 90) return 'red';
        if (ratio > 70) return 'yellow';
        return 'green';
    };

    // Smart Alerts (Simplified for mixed view)
    const generateSmartAlerts = () => {
        const alerts = [];

        // Only run category checks if NOT in year view (too detailed) or adapt?
        // Let's stick to budget check for year view

        if (budgetUsageRatio > 70 && budgetUsageRatio < 100) {
            alerts.push({
                type: 'warning',
                icon: '📊',
                title: 'Presupuesto en riesgo',
                desc: `Has consumido el ${budgetUsageRatio.toFixed(0)}% del presupuesto ${isYearView ? 'anual' : 'mensual'}`
            });
        }

        if (displayedSavingsRate > 20) {
            alerts.push({
                type: 'success',
                icon: '🎯',
                title: 'Excelente tasa de ahorro',
                desc: `Estás ahorrando el ${displayedSavingsRate.toFixed(0)}% de tus ingresos`
            });
        }

        // Investment capacity (only month view makes sense usually, but logic holds for year too)
        if (displayedSavings > 0 && displayedBudget > 0) {
            const safeToInvest = displayedSavings * 0.7;
            if (safeToInvest > 100) {
                alerts.push({
                    type: 'success',
                    icon: '💡',
                    title: 'Capacidad de inversión',
                    desc: `Resultados positivos: Podrías invertir ${formatCurrency(safeToInvest)}`
                });
            }
        }

        return alerts.slice(0, 4);
    };

    const smartAlerts = generateSmartAlerts();

    // Data for monthly chart (Always useful)
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyData = monthNamesShort.map((name, idx) => {
        const mIncomes = filteredIncomes.filter((i) => getMonth(i.date) === idx);
        const mExpenses = filteredExpenses.filter((e) => getMonth(e.date) === idx);
        const inc = mIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const exp = mExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        return { name, income: inc, expenses: exp, savings: inc - exp };
    }).filter((d) => d.income > 0 || d.expenses > 0);

    // Savings target line for chart
    const avgMonthlySavingsTarget = (displayedBudget / (isYearView ? 12 : 1)) > 0
        ? (displayedIncome - displayedExpenses) // Just use current saving for line or budget diff? 
        : displayedSavings;
    // Simplification: In Year View, the monthly chart still shows months. 
    // The "Target" line (dashed) is interesting. Let's keep it as (Monthly Budget - Avg Expenses)? 
    // Actually earlier it was `monthIncome - monthlyBudget`.
    // Let's keep it simple: `(Total Income / 12) - (Total Budget / 12)` if year view?
    // Or just hide it if complex. Let's use `monthlyBudgetBase` for budget line context.

    // Category data (filtered by scope)
    const expenseByCat = {};
    currentMonthExpenses.forEach((e) => {
        if (!expenseByCat[e.category]) expenseByCat[e.category] = 0;
        expenseByCat[e.category] += parseFloat(e.amount);
    });
    const categoryData = Object.entries(expenseByCat)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Fixed vs Variable
    const expenseByType = { Fijo: 0, Variable: 0 };
    currentMonthExpenses.forEach((e) => {
        const type = e.expense_type || 'Variable';
        expenseByType[type] = (expenseByType[type] || 0) + parseFloat(e.amount);
    });
    const typeData = Object.entries(expenseByType).map(([name, value]) => ({ name, value }));
    const typeDataTotal = typeData.reduce((sum, t) => sum + t.value, 0);

    // Available years
    const allYears = [...new Set([
        ...incomes.map((i) => getYear(i.date)).filter(y => y !== null),
        ...expenses.map((e) => getYear(e.date)).filter(y => y !== null),
        new Date().getFullYear()
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
            {/* Status Header - Responsive Refactor */}
            <div className="responsive-header">
                <div>
                    <div className="status-header-title">Estado financiero {periodLabel}</div>
                    <div className="status-header-subtitle">{financialStatus.desc}</div>
                </div>
                <div className="header-controls">
                    <div className={`status-badge ${financialStatus.status}`}>
                        <span className="status-badge-icon"></span>
                        {financialStatus.label}
                    </div>

                    {/* Segmented Control for Period Toggle */}
                    <div className="segmented-control">
                        <button
                            onClick={() => {
                                if (selectedMonth === -1) setSelectedMonth(new Date().getMonth());
                            }}
                            className={`segmented-btn ${selectedMonth !== -1 ? 'active' : ''}`}
                        >
                            Este mes
                        </button>
                        <button
                            onClick={() => setSelectedMonth(-1)}
                            className={`segmented-btn ${selectedMonth === -1 ? 'active' : ''}`}
                        >
                            <span className="visible-mobile">Año</span>
                            <span className="hidden-mobile">Año completo</span>
                        </button>
                    </div>

                    <select
                        className="form-input form-select"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        style={{ minWidth: '100px' }}
                    >
                        {allYears.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {selectedMonth !== -1 && (
                        <select
                            className="form-input form-select"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            style={{ minWidth: '120px' }}
                        >
                            {monthNames.map((name, idx) => (
                                <option key={idx} value={idx}>{name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Enhanced KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ingresos {periodLabel}</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-success">{formatCurrency(displayedIncome)}</div>
                    </div>
                    {prevPeriodRecalculated.income > 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${incomeTrend >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(incomeTrend).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Gastos {periodLabel}</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-danger">{formatCurrency(displayedExpenses)}</div>
                    </div>
                    {prevPeriodRecalculated.expense > 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${expenseTrend <= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(expenseTrend).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ahorro {periodLabel}</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${displayedSavings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {formatCurrency(displayedSavings)}
                        </div>
                    </div>
                    {prevPeriodSaving !== 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${savingsTrend >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(savingsTrend).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Tasa de ahorro {periodLabel}</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${displayedSavingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {displayedSavingsRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="kpi-trend">
                        <span className="text-muted text-sm">
                            {formatCurrency(displayedSavings)} en total
                        </span>
                    </div>
                </div>
            </div>

            {/* Budget Progress with Zones */}
            {displayedBudget > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">Presupuesto {isYearView ? 'anual' : 'mensual'}</h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuesto</div>
                                <div className="font-semibold">{formatCurrency(displayedBudget)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gastado</div>
                                <div className="font-semibold">{formatCurrency(displayedExpenses)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Disponible</div>
                                <div className={`font-semibold ${displayedBudget - displayedExpenses >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatCurrency(displayedBudget - displayedExpenses)}
                                </div>
                            </div>
                        </div>
                        <div className="progress-zoned">
                            <div
                                className={`progress-zoned-bar ${getProgressColor(budgetUsageRatio)}`}
                                style={{ width: `${Math.min(budgetUsageRatio, 100)}%` }}
                            />
                        </div>
                        {!isYearView && (
                            <div className="projection-text">
                                📈 Si mantienes este ritmo, cerrarás el mes con un gasto de {formatCurrency(projectedExpenses)}
                                {projectedExpenses > displayedBudget && (
                                    <span className="text-danger"> (superarás el presupuesto)</span>
                                )}
                            </div>
                        )}
                        {/* Optionally add Year projection here if desired later */}
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

            {/* Chart 1: Monthly Savings Bar Chart */}
            {monthlyData.length > 0 && (
                <ChartContainer
                    title="Evolución mensual del ahorro"
                    heightMobile={280}
                    heightDesktop={260}
                    refreshKey={`${monthlyData.length}-${isYearView ? 'year' : 'month'}-${selectedYear}`}
                    render={({ width, height, isMobile }) => (
                        <BarChart
                            width={width}
                            height={height}
                            data={monthlyData}
                            margin={{ top: 10, right: isMobile ? 10 : 20, left: isMobile ? 0 : 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="name"
                                stroke="var(--text-tertiary)"
                                tick={{ fontSize: isMobile ? 10 : 11 }}
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="var(--text-tertiary)"
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                width={isMobile ? 35 : 45}
                            />
                            <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                            {/* Disabled ReferenceLine for complexity reduction - could read 'monthlyBudgetBase' */}
                            <Bar
                                dataKey="savings"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={isMobile ? 40 : 60}
                            >
                                {monthlyData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.savings >= 0 ? '#3B82F6' : '#EF4444'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                />
            )}

            <div className="grid grid-2 gap-lg">
                {/* Chart 2: Category Pie Chart */}
                {categoryData.length > 0 && (
                    <ChartContainer
                        title={`Gastos por categoría ${periodLabel}`}
                        heightMobile={300}
                        heightDesktop={280}
                        className="chart-pie"
                        refreshKey={`${categoryData.length}-${selectedMonth}`}
                        render={({ width, height }) => {
                            const size = Math.min(width, height);
                            const outerR = size * 0.28;
                            const innerR = size * 0.18;
                            return (
                                <PieChart width={width} height={height}>
                                    <Pie
                                        data={categoryData}
                                        cx={width / 2}
                                        cy={height / 2 - 20}
                                        innerRadius={innerR}
                                        outerRadius={outerR}
                                        dataKey="value"
                                        labelLine={false}
                                        label={renderPieLabel}
                                    >
                                        {categoryData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<PieTooltip />} />
                                    <Legend
                                        layout="horizontal"
                                        verticalAlign="bottom"
                                        align="center"
                                        wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                                    />
                                </PieChart>
                            );
                        }}
                    />
                )}

                {/* Chart 3: Fixed vs Variable Pie Chart */}
                {typeData.length > 0 && (
                    <ChartContainer
                        title={`Gasto fijo vs variable ${periodLabel}`}
                        heightMobile={300}
                        heightDesktop={280}
                        className="chart-pie"
                        refreshKey={`${typeDataTotal}-${selectedMonth}`}
                        render={({ width, height }) => {
                            const size = Math.min(width, height);
                            const outerR = size * 0.28;
                            const innerR = size * 0.18;
                            return (
                                <PieChart width={width} height={height}>
                                    <Pie
                                        data={typeData}
                                        cx={width / 2}
                                        cy={height / 2 - 20}
                                        innerRadius={innerR}
                                        outerRadius={outerR}
                                        dataKey="value"
                                        labelLine={false}
                                        label={renderPieLabel}
                                    >
                                        <Cell fill="#3B82F6" />
                                        <Cell fill="#10B981" />
                                    </Pie>
                                    <Tooltip content={<PieTooltip />} />
                                    <Legend
                                        layout="horizontal"
                                        verticalAlign="bottom"
                                        align="center"
                                        wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                                    />
                                </PieChart>
                            );
                        }}
                    />
                )}
            </div>

            {/* Year Summary - Only needed if NOT in Year View? Or keep redundancy? 
                Actually, if user selects "Todo el año", the top KPIs are the year summary.
                So this card becomes redundant in Year View. Let's hide it if isYearView.
            */}
            {!isYearView && (
                <div className="card mt-lg">
                    <div className="card-header">
                        <h3>Resumen anual {selectedYear}</h3>
                    </div>
                    <div className="card-body">
                        <div className="grid grid-4 gap-md">
                            <div>
                                <div className="text-muted text-sm">Total ingresos</div>
                                <div className="font-semibold text-success">{formatCurrency(filteredIncomes.reduce((s, i) => s + parseFloat(i.amount), 0))}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Total gastos</div>
                                <div className="font-semibold text-danger">{formatCurrency(filteredExpenses.reduce((s, e) => s + parseFloat(e.amount), 0))}</div>
                            </div>
                            {/* ... can be simplified or just rely on the main KPIs when user toggles mode ... */}
                            {/* For now, leaving it as a quick glance when in month mode. */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
