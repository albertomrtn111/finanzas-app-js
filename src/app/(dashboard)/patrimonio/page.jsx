'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import ChartContainer from '@/components/ChartContainer';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Safe number parser - prevents NaN from propagating
const safeFloat = (val) => {
    if (val === null || val === undefined) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
};

// Safe date parser
const safeDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

export default function PatrimonioPage() {
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [invRes, cashRes] = await Promise.all([
                    fetch('/api/investments'),
                    fetch('/api/cash'),
                ]);

                const invData = invRes.ok ? await invRes.json() : [];
                const cashData = cashRes.ok ? await cashRes.json() : [];

                setInvestments(Array.isArray(invData) ? invData : []);
                setCashSnapshots(Array.isArray(cashData) ? cashData : []);
            } catch (err) {
                console.error('Error loading patrimonio data:', err);
                setError('Error al cargar los datos');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const formatCurrency = (amount) => {
        const safeAmount = safeFloat(amount);
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(safeAmount);
    };

    // Calculate investment value per account (latest record)
    const investmentsByAccount = useMemo(() => {
        if (!Array.isArray(investments)) return {};
        const accounts = {};
        investments.forEach((inv) => {
            if (!inv || !inv.account) return;
            const invDate = safeDate(inv.date);
            if (!invDate) return;

            const existingDate = accounts[inv.account] ? safeDate(accounts[inv.account].date) : null;
            if (!existingDate || invDate > existingDate) {
                accounts[inv.account] = inv;
            }
        });
        return accounts;
    }, [investments]);

    // Calculate contributions per account
    const contributionsByAccount = useMemo(() => {
        if (!Array.isArray(investments)) return {};
        const accounts = {};
        investments.forEach((inv) => {
            if (!inv || !inv.account) return;
            if (!accounts[inv.account]) accounts[inv.account] = 0;
            accounts[inv.account] += safeFloat(inv.contribution);
        });
        return accounts;
    }, [investments]);

    const totalInvestments = Object.values(investmentsByAccount).reduce(
        (sum, inv) => sum + safeFloat(inv?.current_value), 0
    );
    const totalContributions = Object.values(contributionsByAccount).reduce(
        (sum, c) => sum + safeFloat(c), 0
    );

    // Calculate cash per account (latest record)
    const cashByAccount = useMemo(() => {
        if (!Array.isArray(cashSnapshots)) return {};
        const accounts = {};
        cashSnapshots.forEach((snap) => {
            if (!snap || !snap.account) return;
            const snapDate = safeDate(snap.date);
            if (!snapDate) return;

            const existingDate = accounts[snap.account] ? safeDate(accounts[snap.account].date) : null;
            if (!existingDate || snapDate > existingDate) {
                accounts[snap.account] = snap;
            }
        });
        return accounts;
    }, [cashSnapshots]);

    const totalCash = Object.values(cashByAccount).reduce(
        (sum, snap) => sum + safeFloat(snap?.current_value), 0
    );
    const totalPatrimonio = totalInvestments + totalCash;

    // Calculate first recorded patrimony for growth
    const firstPatrimony = useMemo(() => {
        const allDates = [
            ...investments.map(i => safeDate(i?.date)),
            ...cashSnapshots.map(c => safeDate(c?.date))
        ].filter(d => d !== null).sort((a, b) => a - b);

        if (allDates.length === 0) return 0;

        const firstMonth = allDates[0];
        const firstMonthInv = investments.filter(i => {
            const d = safeDate(i?.date);
            return d && d.getMonth() === firstMonth.getMonth() && d.getFullYear() === firstMonth.getFullYear();
        });
        const firstMonthCash = cashSnapshots.filter(c => {
            const d = safeDate(c?.date);
            return d && d.getMonth() === firstMonth.getMonth() && d.getFullYear() === firstMonth.getFullYear();
        });

        const invValue = firstMonthInv.reduce((sum, i) => sum + safeFloat(i?.current_value), 0);
        const cashValue = firstMonthCash.reduce((sum, c) => sum + safeFloat(c?.current_value), 0);

        return invValue + cashValue;
    }, [investments, cashSnapshots]);

    const growthSinceStart = firstPatrimony > 0
        ? ((totalPatrimonio - firstPatrimony) / firstPatrimony) * 100
        : 0;
    const absoluteGrowth = totalPatrimonio - firstPatrimony;

    // Working money percentage (investments / total)
    const workingMoneyPct = totalPatrimonio > 0 ? (totalInvestments / totalPatrimonio) * 100 : 0;

    // Distribution data for pie chart
    const distributionData = [
        { name: 'Inversiones', value: totalInvestments },
        { name: 'Efectivo', value: totalCash },
    ].filter((d) => d.value > 0);

    // refreshKey for distribution chart
    const distributionRefreshKey = distributionData.length > 0
        ? distributionData.map(d => d.value.toFixed(0)).join('-')
        : '0';

    // Detail by account with return calculation
    const allAccounts = useMemo(() => {
        const accounts = [];

        Object.entries(investmentsByAccount).forEach(([account, inv]) => {
            const contrib = safeFloat(contributionsByAccount[account]);
            const value = safeFloat(inv?.current_value);
            const gain = value - contrib;
            const returnPct = contrib !== 0 ? (gain / contrib) * 100 : 0;

            accounts.push({
                type: 'Inversión',
                account,
                value,
                contrib,
                gain,
                returnPct: isFinite(returnPct) ? returnPct : 0,
                weight: totalPatrimonio > 0 ? (value / totalPatrimonio) * 100 : 0
            });
        });

        Object.entries(cashByAccount).forEach(([account, snap]) => {
            const value = safeFloat(snap?.current_value);
            accounts.push({
                type: 'Efectivo',
                account,
                value,
                contrib: value,
                gain: 0,
                returnPct: 0,
                weight: totalPatrimonio > 0 ? (value / totalPatrimonio) * 100 : 0
            });
        });

        return accounts.sort((a, b) => b.value - a.value);
    }, [investmentsByAccount, contributionsByAccount, cashByAccount, totalPatrimonio]);

    // refreshKey for accounts bar chart
    const accountsRefreshKey = allAccounts.length;

    // Calculate YTD if we have January data
    const ytdGrowth = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const januarySnapshots = cashSnapshots.filter((s) => {
            const d = safeDate(s?.date);
            return d && d.getFullYear() === currentYear && d.getMonth() === 0;
        });
        const januaryInvestments = investments.filter((i) => {
            const d = safeDate(i?.date);
            return d && d.getFullYear() === currentYear && d.getMonth() === 0;
        });

        if (januarySnapshots.length === 0 && januaryInvestments.length === 0) return null;

        const janCash = januarySnapshots.reduce((sum, s) => sum + safeFloat(s?.current_value), 0);
        const janInv = januaryInvestments.reduce((sum, i) => sum + safeFloat(i?.current_value), 0);
        const janTotal = janCash + janInv;

        if (janTotal <= 0) return null;
        const growth = ((totalPatrimonio - janTotal) / janTotal) * 100;
        return isFinite(growth) ? growth : null;
    }, [cashSnapshots, investments, totalPatrimonio]);

    // Check if we have any data
    const hasData = investments.length > 0 || cashSnapshots.length > 0;

    if (loading) {
        return (
            <div className="page-container">
                <div className="flex-center" style={{ minHeight: '400px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="empty-state">
                    <div className="empty-state-icon">⚠️</div>
                    <h3>Error al cargar datos</h3>
                    <p className="text-muted">{error}</p>
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Patrimonio</h1>
                    <p className="page-subtitle">Vista consolidada de inversiones y efectivo</p>
                </div>

                <div className="empty-state" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                    <h3 style={{ marginBottom: '0.5rem' }}>No hay datos aún</h3>
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        Añade inversiones o registros de efectivo para ver tu patrimonio consolidado.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link href="/inversiones/registro" className="btn btn-primary">
                            ➕ Añadir inversión
                        </Link>
                        <Link href="/efectivo" className="btn btn-secondary">
                            💰 Añadir efectivo
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Patrimonio</h1>
                <p className="page-subtitle">Vista consolidada de inversiones y efectivo</p>
            </div>

            {/* Growth Since Start */}
            {firstPatrimony > 0 && (
                <div className="status-header">
                    <div>
                        <div className="status-header-title">Crecimiento desde el inicio</div>
                        <div className="status-header-subtitle">Tu progreso financiero</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div className="text-center">
                            <div className={`kpi-value ${absoluteGrowth >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                                {formatCurrency(absoluteGrowth)}
                            </div>
                            <div className="text-muted text-sm">Total</div>
                        </div>
                        <div className="text-center">
                            <div className={`kpi-value ${growthSinceStart >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                                <span className={`trend ${growthSinceStart >= 0 ? 'trend-up' : 'trend-down'}`}>
                                    {Math.abs(growthSinceStart).toFixed(1)}%
                                </span>
                            </div>
                            <div className="text-muted text-sm">Rentabilidad</div>
                        </div>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Patrimonio total</div>
                    <div className="kpi-value">{formatCurrency(totalPatrimonio)}</div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Inversiones</div>
                    <div className="kpi-value text-success">{formatCurrency(totalInvestments)}</div>
                    <div className="kpi-trend">
                        <span className={`trend ${totalInvestments - totalContributions >= 0 ? 'trend-up' : 'trend-down'}`}>
                            {formatCurrency(totalInvestments - totalContributions)} plusvalía
                        </span>
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Efectivo</div>
                    <div className="kpi-value" style={{ color: 'var(--primary)' }}>{formatCurrency(totalCash)}</div>
                </div>
                {ytdGrowth !== null && (
                    <div className="kpi-card-enhanced">
                        <div className="kpi-label">Crecimiento YTD</div>
                        <div className={`kpi-value ${ytdGrowth >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            <span className={`trend ${ytdGrowth >= 0 ? 'trend-up' : 'trend-down'}`}>
                                {Math.abs(ytdGrowth).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-2 gap-lg">
                {/* Distribution Pie Chart */}
                <ChartContainer
                    title="Distribución del patrimonio"
                    heightMobile={300}
                    heightDesktop={280}
                    className="chart-pie"
                    refreshKey={distributionRefreshKey}
                    render={({ width, height }) => {
                        if (distributionData.length === 0) {
                            return (
                                <div className="flex-center" style={{ height: '100%' }}>
                                    <p className="text-muted">No hay datos para mostrar</p>
                                </div>
                            );
                        }
                        const size = Math.min(width, height);
                        const outerR = size * 0.28;
                        const innerR = size * 0.18;
                        return (
                            <PieChart width={width} height={height}>
                                <Pie
                                    data={distributionData}
                                    cx={width / 2}
                                    cy={height / 2 - 20}
                                    innerRadius={innerR}
                                    outerRadius={outerR}
                                    dataKey="value"
                                    labelLine={false}
                                >
                                    {distributionData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value) => formatCurrency(value)}
                                    contentStyle={{
                                        maxWidth: '180px',
                                        fontSize: '12px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-color)'
                                    }}
                                />
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

                {/* Value by Account Bar Chart */}
                <ChartContainer
                    title="Valor por cuenta"
                    heightMobile={300}
                    heightDesktop={280}
                    className="chart-bar"
                    refreshKey={accountsRefreshKey}
                    render={({ width, height, isMobile }) => {
                        if (allAccounts.length === 0 || !allAccounts.some(a => a.value > 0)) {
                            return (
                                <div className="flex-center" style={{ height: '100%' }}>
                                    <p className="text-muted">No hay datos para mostrar</p>
                                </div>
                            );
                        }
                        return (
                            <BarChart
                                width={width}
                                height={height}
                                data={allAccounts.slice(0, 6)}
                                layout="vertical"
                                margin={{ top: 10, right: isMobile ? 10 : 20, left: isMobile ? 5 : 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    type="number"
                                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                    tick={{ fontSize: 10 }}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="account"
                                    width={isMobile ? 60 : 80}
                                    tick={{ fontSize: isMobile ? 9 : 10 }}
                                    tickFormatter={(v) => v.length > (isMobile ? 8 : 12) ? v.substring(0, isMobile ? 8 : 12) + '…' : v}
                                />
                                <Tooltip
                                    formatter={(value) => formatCurrency(value)}
                                    contentStyle={{
                                        maxWidth: '180px',
                                        fontSize: '12px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border-color)'
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={isMobile ? 24 : 30}>
                                    {allAccounts.slice(0, 6).map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.type === 'Inversión' ? '#10B981' : '#3B82F6'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        );
                    }}
                />
            </div>

            {/* Invested percentage note */}
            <div style={{ textAlign: 'center', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                <span className="text-muted text-sm">
                    💡 {workingMoneyPct.toFixed(0)}% de tu patrimonio está invertido
                </span>
            </div>

            {/* Detail Table */}
            <div className="card mt-lg">
                <div className="card-header"><h3>Detalle por cuenta</h3></div>
                <div className="card-body">
                    {allAccounts.length === 0 ? (
                        <div className="empty-state">
                            <p>No hay datos de patrimonio registrados</p>
                        </div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table data-table">
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Cuenta</th>
                                        <th>Valor</th>
                                        <th>Rendimiento</th>
                                        <th>% Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allAccounts.map((acc, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <span className={`badge ${acc.type === 'Inversión' ? 'badge-success' : 'badge-primary'}`}>
                                                    {acc.type === 'Inversión' ? 'Inv' : 'Cash'}
                                                </span>
                                            </td>
                                            <td className="font-semibold" style={{ whiteSpace: 'nowrap' }}>
                                                {acc.account.length > 15 ? acc.account.substring(0, 15) + '…' : acc.account}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{formatCurrency(acc.value)}</td>
                                            <td>
                                                {acc.type === 'Inversión' ? (
                                                    <span className={acc.returnPct >= 0 ? 'text-success' : 'text-danger'}>
                                                        <span className={`trend ${acc.returnPct >= 0 ? 'trend-up' : 'trend-down'}`}>
                                                            {Math.abs(acc.returnPct).toFixed(1)}%
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <div className="progress" style={{ width: '40px', height: '4px' }}>
                                                        <div
                                                            className="progress-bar"
                                                            style={{ width: `${Math.min(acc.weight, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem' }}>{acc.weight.toFixed(0)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
