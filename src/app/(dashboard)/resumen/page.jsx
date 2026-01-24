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
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

    useEffect(() => {
        loadData();
    }, [selectedYear, selectedMonth]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Determine params
            const period = selectedMonth === -1 ? 'year' : 'month';
            const params = new URLSearchParams({
                year: selectedYear.toString(),
                period: period
            });
            if (period === 'month') {
                params.append('month', selectedMonth.toString());
            }

            const res = await fetch(`/api/summary?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setSummary(data);
            }
        } catch (error) {
            console.error('Error cargando resumen:', error);
        }
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const periodLabel = selectedMonth === -1
        ? `(${selectedYear})`
        : `(${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][selectedMonth]} ${selectedYear})`;

    const trendLabel = selectedMonth === -1 ? 'vs año anterior' : 'vs mes anterior';

    // Month names for select
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Generate years list (simple range for now, or could fetch available years from API if needed, strictly defaulting to recent range)
    // To match previous logic exactly, we'd need to fetch year range. 
    // For efficiency, let's hardcode a reasonable range or keep it dynamic if we had the list. 
    // Let's assume user has data in recent 5 years + next year.
    const currentYear = new Date().getFullYear();
    const allYears = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i); // [2026, 2025, 2024...]

    if (loading && !summary) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    // Default empty structure if load failed
    const data = summary || {
        kpi: { income: 0, expenses: 0, savings: 0, savingsRate: 0, trends: { income: 0, expenses: 0, savings: 0 } },
        budget: { total: 0, usage: 0, ratio: 0 },
        charts: { monthly: [], categories: [], types: [] },
        meta: { period: 'year' }
    };

    // Helper colors
    const getProgressColor = (ratio) => {
        if (ratio > 90) return 'red';
        if (ratio > 70) return 'yellow';
        return 'green';
    };

    const getFinancialStatus = () => {
        const { ratio, total } = data.budget;
        const { savings, savingsRate } = data.kpi;
        const isYearView = data.meta.period === 'year';

        if (ratio > 100 || savings < 0) {
            return { status: 'danger', label: 'Excedido', desc: 'Gastos por encima del presupuesto' };
        }
        if (ratio > (isYearView ? 90 : 70) || (savingsRate > 0 && savingsRate < 10)) {
            return { status: 'warning', label: 'Riesgo', desc: 'Acercándote al límite' };
        }
        return { status: 'success', label: 'Bajo control', desc: 'Finanzas saludables' };
    };

    const financialStatus = getFinancialStatus();

    // Projected expenses logic (client side estimation based on current date)
    const isCurrentPeriod = data.meta.period === 'month'
        && selectedYear === new Date().getFullYear()
        && selectedMonth === new Date().getMonth();

    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const projectedExpenses = (isCurrentPeriod && dayOfMonth > 0)
        ? (data.kpi.expenses / dayOfMonth) * daysInMonth
        : data.kpi.expenses;

    // Smart Alerts
    const generateSmartAlerts = () => {
        const alerts = [];
        const { ratio } = data.budget;
        const { savingsRate, savings } = data.kpi;

        if (ratio > 70 && ratio < 100) {
            alerts.push({
                type: 'warning',
                icon: '📊',
                title: 'Presupuesto en riesgo',
                desc: `Has consumido el ${ratio.toFixed(0)}% del presupuesto`
            });
        }
        if (savingsRate > 20) {
            alerts.push({
                type: 'success',
                icon: '🎯',
                title: 'Excelente tasa de ahorro',
                desc: `Estás ahorrando el ${savingsRate.toFixed(0)}% de tus ingresos`
            });
        }
        if (savings > 0 && data.budget.total > 0) {
            const safeToInvest = savings * 0.7;
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

    // Chart Data Preparation
    const monthlyData = data.charts.monthly.filter(d => d.income > 0 || d.expenses > 0);
    const categoryData = data.charts.categories;
    const typeData = data.charts.types;

    return (
        <div className="page-container">
            {/* Status Header */}
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
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
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
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            style={{ minWidth: '120px' }}
                        >
                            {monthNames.map((name, idx) => (
                                <option key={idx} value={idx}>{name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ingresos</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-success">{formatCurrency(data.kpi.income)}</div>
                    </div>
                    {data.kpi.trends.income !== 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${data.kpi.trends.income >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(data.kpi.trends.income).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Gastos</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-danger">{formatCurrency(data.kpi.expenses)}</div>
                    </div>
                    {data.kpi.trends.expenses !== 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${data.kpi.trends.expenses <= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(data.kpi.trends.expenses).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${data.kpi.savings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {formatCurrency(data.kpi.savings)}
                        </div>
                    </div>
                    {data.kpi.trends.savings !== 0 && (
                        <div className="kpi-trend">
                            <span className={`trend ${data.kpi.trends.savings >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(data.kpi.trends.savings).toFixed(0)}% {trendLabel}
                            </span>
                        </div>
                    )}
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Tasa de ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${data.kpi.savingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {data.kpi.savingsRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className="kpi-trend">
                        <span className="text-muted text-sm">
                            Target: 20%
                        </span>
                    </div>
                </div>
            </div>

            {/* Budget */}
            {data.budget.total > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">Presupuesto {data.meta.period === 'year' ? 'anual' : 'mensual'}</h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuesto</div>
                                <div className="font-semibold">{formatCurrency(data.budget.total)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gastado</div>
                                <div className="font-semibold">{formatCurrency(data.budget.usage)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Disponible</div>
                                <div className={`font-semibold ${data.budget.total - data.budget.usage >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatCurrency(data.budget.total - data.budget.usage)}
                                </div>
                            </div>
                        </div>
                        <div className="progress-zoned">
                            <div
                                className={`progress-zoned-bar ${getProgressColor(data.budget.ratio)}`}
                                style={{ width: `${Math.min(data.budget.ratio, 100)}%` }}
                            />
                        </div>
                        {isCurrentPeriod && (
                            <div className="projection-text">
                                📈 Si mantienes este ritmo, cerrarás el mes con un gasto de {formatCurrency(projectedExpenses)}
                                {projectedExpenses > data.budget.total && (
                                    <span className="text-danger"> (superarás el presupuesto)</span>
                                )}
                            </div>
                        )}
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


            {/* Charts */}
            {monthlyData.length > 0 && (
                <ChartContainer
                    title="Evolución mensual del ahorro"
                    heightMobile={280}
                    heightDesktop={260}
                    // Refresh if data changes drastically
                    refreshKey={`${monthlyData.length}-${selectedYear}`}
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
                {categoryData.length > 0 && (
                    <ChartContainer
                        title={`Gastos por categoría`}
                        heightMobile={300}
                        heightDesktop={280}
                        className="chart-pie"
                        refreshKey={categoryData.length}
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

                {typeData.length > 0 && (
                    <ChartContainer
                        title={`Gasto fijo vs variable`}
                        heightMobile={300}
                        heightDesktop={280}
                        className="chart-pie"
                        refreshKey={typeData.length}
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
        </div>
    );
}
