'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import ChartContainer from '@/components/ChartContainer';
import CustomTooltip from '@/components/charts/CustomTooltip';
import PieTooltip from '@/components/charts/PieTooltip';
import { renderPieLabel } from '@/lib/chartUtils';
import { formatCompactEuro, formatEuro, formatPct, formatSignedEuro, formatSignedPct } from '@/lib/moneyFormat';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const NEUTRAL_BADGE = { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' };

const getProgressColor = (ratio) => {
    if (ratio > 90) return 'red';
    if (ratio > 70) return 'yellow';
    return 'green';
};

// Variación frente al tramo equivalente. La flecha indica si sube o baja; el color, si es bueno o malo
// para esa cifra (más ingresos o ahorro es bueno; más gasto es malo).
function Trend({ value, goodWhenUp, label, format, previousEmpty }) {
    if (value === null || value === undefined) {
        if (!previousEmpty) return null;
        return <div className="kpi-trend"><span className="text-muted text-sm">Sin datos en {label}</span></div>;
    }
    if (value === 0) {
        return <div className="kpi-trend"><span className="text-muted text-sm">= Igual que en {label}</span></div>;
    }
    const up = value > 0;
    const good = up === goodWhenUp;
    return (
        <div className="kpi-trend">
            <span className={`trend ${good ? 'text-success' : 'text-danger'}`} title={good ? 'Mejor que el periodo anterior' : 'Peor que el periodo anterior'}>
                {up ? '▲' : '▼'} {format(value)} vs {label}
            </span>
        </div>
    );
}

export default function ResumenPage() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

    const loadData = useCallback(async (signal) => {
        setLoading(true);
        setError('');
        try {
            const period = selectedMonth === -1 ? 'year' : 'month';
            const params = new URLSearchParams({ year: selectedYear.toString(), period });
            if (period === 'month') params.append('month', selectedMonth.toString());

            const res = await fetch(`/api/summary?${params.toString()}`, { signal });
            if (!res.ok) throw new Error('No se pudo cargar el resumen');
            const data = await res.json();
            if (!signal?.aborted) setSummary(data);
        } catch (error) {
            if (!signal?.aborted) setError(error.message || 'No se pudo cargar el resumen');
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [selectedYear, selectedMonth]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => { void loadData(controller.signal); }, 0);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [loadData]);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const goToCurrentMonth = () => {
        setSelectedYear(currentYear);
        setSelectedMonth(currentMonth);
    };

    if (loading && !summary) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error && !summary) {
        return <div className="page-container"><div className="alert alert-danger" role="alert">
            {error} <button className="btn btn-secondary" onClick={() => loadData(new AbortController().signal)}>Reintentar</button>
        </div></div>;
    }

    const data = summary;
    const { kpi, budget, comparison, status, meta } = data;
    const isYearView = meta.period === 'year';
    const periodLabel = isYearView ? `(${meta.year})` : `(${MONTH_NAMES[meta.month]} ${meta.year})`;
    const comparisonLabel = comparison.previousLabel;
    const previousEmpty = comparison.previous.income === 0 && comparison.previous.expenses === 0;

    // Años con datos: del primer registro al año actual (o al último registro, si hay fechas futuras).
    const firstYear = Math.min(meta.firstYear ?? currentYear, currentYear, selectedYear);
    const lastYear = Math.max(meta.lastYear ?? currentYear, currentYear, selectedYear);
    const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);

    const isCurrentMonthView = !isYearView && selectedYear === currentYear && selectedMonth === currentMonth;

    // Proyección del mes en curso, solo sobre las categorías con presupuesto.
    const [todayYear, todayMonth, todayDay] = meta.today.split('-').map(Number);
    const isRunningMonth = !isYearView && meta.partial && meta.year === todayYear && meta.month === todayMonth - 1;
    const daysInMonth = new Date(Date.UTC(meta.year, meta.month + 1, 0)).getUTCDate();
    const projectedBudgeted = isRunningMonth && todayDay > 0 ? (budget.usage / todayDay) * daysInMonth : budget.usage;

    const smartAlerts = [];
    if (budget.overCategories.length > 0) {
        smartAlerts.push({
            type: 'danger', icon: '🚨',
            title: budget.overCategories.length === 1 ? 'Una categoría supera su presupuesto' : `${budget.overCategories.length} categorías superan su presupuesto`,
            desc: budget.overCategories.join(', '),
        });
    }
    if (budget.total > 0 && budget.ratio >= 70 && budget.ratio <= 100) {
        smartAlerts.push({
            type: 'warning', icon: '📊', title: 'Presupuesto en riesgo',
            desc: `Has consumido el ${formatPct(budget.ratio, 0)} de lo presupuestado`,
        });
    }
    if (kpi.savingsRate !== null && kpi.savingsRate > 20) {
        smartAlerts.push({
            type: 'success', icon: '🎯', title: 'Excelente tasa de ahorro',
            desc: `Estás ahorrando el ${formatPct(kpi.savingsRate, 0)} de tus ingresos`,
        });
    }
    if (kpi.savings > 0 && budget.total > 0 && kpi.savings * 0.7 > 100) {
        smartAlerts.push({
            type: 'success', icon: '💡', title: 'Capacidad de inversión',
            desc: `Resultados positivos: podrías invertir ${formatEuro(kpi.savings * 0.7)}`,
        });
    }

    const monthlyData = data.charts.monthly.filter(d => d.income > 0 || d.expenses > 0);
    const categoryData = data.charts.categories;
    const typeData = data.charts.types;

    return (
        <div className="page-container">
            <div className="responsive-header">
                <div>
                    <div className="status-header-title">Estado financiero {periodLabel}</div>
                    <div className="status-header-subtitle">{status.desc}</div>
                </div>
                <div className="header-controls">
                    <div className={`status-badge ${status.level === 'neutral' ? '' : status.level}`} style={status.level === 'neutral' ? NEUTRAL_BADGE : undefined}>
                        <span className="status-badge-icon" style={status.level === 'neutral' ? { background: 'var(--text-muted)' } : undefined}></span>
                        {status.label}
                    </div>

                    <div className="segmented-control">
                        <button
                            onClick={goToCurrentMonth}
                            className={`segmented-btn ${isCurrentMonthView ? 'active' : ''}`}
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
                        aria-label="Año"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        style={{ minWidth: '100px' }}
                    >
                        {years.map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {selectedMonth !== -1 && (
                        <select
                            className="form-input form-select"
                            aria-label="Mes"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            style={{ minWidth: '120px' }}
                        >
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={idx} value={idx}>{name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {!meta.hasData && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <p className="text-muted" style={{ margin: 0 }}>
                            No hay ingresos ni gastos en {isYearView ? meta.year : `${MONTH_NAMES[meta.month].toLowerCase()} de ${meta.year}`}.{' '}
                            <Link href="/registro">Registrar movimientos</Link>
                        </p>
                    </div>
                </div>
            )}

            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ingresos</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-success">{formatEuro(kpi.income)}</div>
                    </div>
                    <Trend value={comparison.change.incomePct} goodWhenUp label={comparisonLabel} format={formatSignedPct} previousEmpty={previousEmpty && meta.hasData} />
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Gastos</div>
                    <div className="kpi-main">
                        <div className="kpi-value text-danger">{formatEuro(kpi.expenses)}</div>
                    </div>
                    <Trend value={comparison.change.expensesPct} goodWhenUp={false} label={comparisonLabel} format={formatSignedPct} previousEmpty={previousEmpty && meta.hasData} />
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${kpi.savings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {formatEuro(kpi.savings)}
                        </div>
                    </div>
                    <Trend
                        value={previousEmpty ? null : comparison.change.savings}
                        goodWhenUp
                        label={comparisonLabel}
                        format={formatSignedEuro}
                        previousEmpty={previousEmpty && meta.hasData}
                    />
                </div>

                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Tasa de ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${kpi.savingsRate === null ? '' : kpi.savingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {kpi.savingsRate === null ? '—' : formatPct(kpi.savingsRate)}
                        </div>
                    </div>
                    <div className="kpi-trend">
                        <span className="text-muted text-sm">
                            {kpi.savingsRate === null ? 'Sin ingresos en el periodo' : `Objetivo: ${formatPct(20)}`}
                        </span>
                    </div>
                </div>
            </div>

            {meta.hasData && (
                <p className="text-muted text-sm" style={{ margin: '0 0 var(--spacing-lg)' }}>
                    {comparison.description}
                </p>
            )}

            {budget.total > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">
                            Presupuesto {isYearView ? 'anual' : 'mensual'}
                            {isYearView && budget.months < 12 && (
                                <span className="text-muted text-sm" style={{ fontWeight: 400 }}> · {budget.months} {budget.months === 1 ? 'mes transcurrido' : 'meses transcurridos'}</span>
                            )}
                        </h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuestado</div>
                                <div className="font-semibold">{formatEuro(budget.total)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gastado en categorías con presupuesto</div>
                                <div className="font-semibold">{formatEuro(budget.usage)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Disponible</div>
                                <div className={`font-semibold ${budget.remaining >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatEuro(budget.remaining)}
                                </div>
                            </div>
                        </div>
                        <div className="progress-zoned">
                            <div
                                className={`progress-zoned-bar ${getProgressColor(budget.ratio)}`}
                                style={{ width: `${Math.min(budget.ratio, 100)}%` }}
                            />
                        </div>
                        {budget.unbudgeted !== 0 && (
                            <div className="text-muted text-sm" style={{ marginTop: 'var(--spacing-sm)' }}>
                                Gasto sin presupuesto: {formatEuro(budget.unbudgeted)}
                                {budget.unbudgetedCategories.length > 0 && ` (${budget.unbudgetedCategories.join(', ')})`}. No cuenta como exceso.
                            </div>
                        )}
                        {isRunningMonth && (
                            <div className="projection-text">
                                📈 Si mantienes este ritmo, el gasto en categorías con presupuesto cerrará el mes en {formatEuro(projectedBudgeted)}
                                {projectedBudgeted > budget.total && (
                                    <span className="text-danger"> (superarás el presupuesto)</span>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                            {budget.categories.map((cat) => (
                                <div key={cat.category}>
                                    <div className="flex-between text-sm">
                                        <span>{cat.category}</span>
                                        <span className={cat.over ? 'text-danger' : 'text-muted'}>
                                            {formatEuro(cat.spent)} de {formatEuro(cat.budget)} ({formatPct(cat.ratio ?? 0)})
                                        </span>
                                    </div>
                                    <div className="progress-zoned" style={{ height: '6px', marginTop: '4px' }}>
                                        <div
                                            className={`progress-zoned-bar ${getProgressColor(cat.ratio ?? 0)}`}
                                            style={{ width: `${Math.min(cat.ratio ?? 0, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {smartAlerts.length > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">💡 Alertas inteligentes</h3>
                        <div className="smart-alerts">
                            {smartAlerts.slice(0, 4).map((alert, idx) => (
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

            {monthlyData.length > 0 && (
                <ChartContainer
                    title={`Evolución mensual del ahorro (${meta.year})`}
                    heightMobile={280}
                    heightDesktop={260}
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
                                tickFormatter={formatCompactEuro}
                                width={isMobile ? 52 : 64}
                            />
                            <Tooltip content={<CustomTooltip formatter={formatEuro} />} />
                            <Bar
                                dataKey="savings"
                                name="Ahorro"
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
                        title="Gastos por categoría"
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
                        title="Gasto fijo vs variable"
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
                                        {typeData.map((_, index) => (
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
            </div>
        </div>
    );
}
