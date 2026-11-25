'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import ChartContainer from '@/components/ChartContainer';
import PieTooltip from '@/components/charts/PieTooltip';
import { renderPieLabel } from '@/lib/chartUtils';
import { useMovementDialog } from '@/components/movements/MovementsProvider';
import { useMovementsChanged } from '@/components/movements/useMovementActions';


import { parseAppDate } from '@/lib/dateUtils';
import { latestByAccount, totalLatestValue } from '@/lib/financialSnapshots';


const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function HomePage() {
    const [home, setHome] = useState(null);
    const [homeError, setHomeError] = useState('');
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [budgets, setBudgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [period, setPeriod] = useState('month');
    const [userName, setUserName] = useState(''); // Initialize empty
    // Apuntar gasto o ingreso: el mismo formulario que el botón «+» y Registro.
    const { openMovement } = useMovementDialog();

    // Totales del periodo, últimos movimientos y último registro, calculados en el servidor.
    // Es lo único que se vuelve a pedir al cambiar de periodo o al guardar un movimiento.
    const loadHome = useCallback(async (signal) => {
        setHomeError('');
        try {
            const res = await fetch(`/api/summary/home?period=${period}`, { signal });
            if (!res.ok) throw new Error('No se pudo cargar el resumen del periodo');
            const data = await res.json();
            if (!signal?.aborted) setHome(data);
        } catch (error) {
            if (!signal?.aborted) setHomeError('No se pudo cargar el resumen del periodo. Inténtalo de nuevo.');
        }
    }, [period]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [invRes, cashRes, budRes, sessionRes] = await Promise.all([
                fetch('/api/investments'),
                fetch('/api/cash'),
                fetch('/api/budgets'),
                fetch('/api/auth/session'),
            ]);
            if ([invRes, cashRes, budRes, sessionRes].some(response => !response.ok)) {
                throw new Error('No se pudieron cargar todos los datos del panel');
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

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => { void loadHome(controller.signal); }, 0);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [loadHome]);

    // Tras apuntar, editar, borrar o deshacer un movimiento (desde aquí o desde el botón «+»),
    // se recargan los totales y los últimos movimientos sin cubrir la pantalla.
    useMovementsChanged(() => { void loadHome(); });

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    // «hoy, 10:32» o «22 nov 2026, 18:05», con la hora del navegador.
    const formatLastUpdate = (iso) => {
        if (!iso) return 'aún no hay registros';
        const d = new Date(iso);
        const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === new Date().toDateString()) return `hoy, ${time}`;
        return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
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

    const periodTotals = home?.totals ?? { income: 0, expenses: 0, savings: 0 };

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

    // Últimos 5 movimientos del periodo, ya ordenados por el servidor.
    const recentActivity = home?.recent ?? [];

    // Emergency fund goal (using total budget as target, cash as current)
    const emergencyFundGoal = useMemo(() => {
        const monthlyBudget = budgets.reduce((sum, b) => sum + parseFloat(b.monthly_amount || 0), 0);
        const targetMonths = 6;
        const target = monthlyBudget * targetMonths;
        const current = currentCash;
        const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
        return { current, target, percentage };
    }, [budgets, currentCash]);

    if (loading || (!home && !homeError)) {
        return (
            <div className="dashboard-home">
                <div className="flex-center" style={{ minHeight: '400px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (loadError || (!home && homeError)) {
        return <div className="page-container"><div className="alert alert-danger" role="alert">
            {loadError || homeError}{' '}
            <button className="btn btn-secondary" onClick={() => { if (loadError) void loadData(); void loadHome(); }}>Reintentar</button>
        </div></div>;
    }

    return (
        <div className="dashboard-home">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-greeting">
                    <h1>Hola, {userName} 👋</h1>
                    <p>Aquí tienes el resumen de tu dinero {period === 'month' ? 'este mes' : 'este año'}</p>
                    <div className="dashboard-meta" title="Momento en que se guardó el último gasto, ingreso, saldo o inversión">
                        Última actualización: {formatLastUpdate(home?.lastRecordAt)}
                    </div>
                    {homeError && <div className="text-danger text-sm" role="alert">{homeError}</div>}
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
                            <div><span>Ahorro del periodo</span><strong>{formatCurrency(periodTotals.savings)}</strong></div>
                        </div>
                        <div className="quick-actions">
                            <button
                                className="quick-action-btn income"
                                onClick={() => openMovement({ kind: 'income' })}
                            >
                                <span>+</span> Ingreso
                            </button>
                            <button
                                className="quick-action-btn expense"
                                onClick={() => openMovement({ kind: 'expense' })}
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
                        <Link href="/registro" className="view-all-link">
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
                                <div className="networth-label">Efectivo</div>
                                <div className="networth-value assets">{formatCurrency(currentCash)}</div>
                            </div>
                            <div className="networth-item">
                                <div className="networth-label">Inversiones</div>
                                <div className="networth-value assets">{formatCurrency(currentInvestments)}</div>
                            </div>
                        </div>
                        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                            Suma de efectivo e inversiones. No descuenta deudas: la app aún no registra pasivos.
                        </p>

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
        </div>
    );
}
