'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function PatrimonioPage() {
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch('/api/investments').then((r) => r.ok ? r.json() : []),
            fetch('/api/cash').then((r) => r.ok ? r.json() : []),
        ])
            .then(([inv, cash]) => {
                setInvestments(Array.isArray(inv) ? inv : []);
                setCashSnapshots(Array.isArray(cash) ? cash : []);
            })
            .catch((error) => {
                console.error('Error loading patrimonio data:', error);
            })
            .finally(() => setLoading(false));
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    const safeFloat = (val) => {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
    };

    // Calculate investment value per account (latest record)
    const investmentsByAccount = useMemo(() => {
        const accounts = {};
        investments.forEach((inv) => {
            if (!inv.account) return;
            const invDate = new Date(inv.date);
            if (isNaN(invDate.getTime())) return;

            if (!accounts[inv.account] || invDate > new Date(accounts[inv.account].date)) {
                accounts[inv.account] = inv;
            }
        });
        return accounts;
    }, [investments]);

    // Calculate contributions per account
    const contributionsByAccount = useMemo(() => {
        const accounts = {};
        investments.forEach((inv) => {
            if (!inv.account) return;
            if (!accounts[inv.account]) accounts[inv.account] = 0;
            accounts[inv.account] += safeFloat(inv.contribution);
        });
        return accounts;
    }, [investments]);

    const totalInvestments = Object.values(investmentsByAccount).reduce((sum, inv) => sum + safeFloat(inv.current_value), 0);
    const totalContributions = Object.values(contributionsByAccount).reduce((sum, c) => sum + c, 0);

    // Calculate cash per account (latest record)
    const cashByAccount = useMemo(() => {
        const accounts = {};
        cashSnapshots.forEach((snap) => {
            if (!snap.account) return;
            const snapDate = new Date(snap.date);
            if (isNaN(snapDate.getTime())) return;

            if (!accounts[snap.account] || snapDate > new Date(accounts[snap.account].date)) {
                accounts[snap.account] = snap;
            }
        });
        return accounts;
    }, [cashSnapshots]);

    const totalCash = Object.values(cashByAccount).reduce((sum, snap) => sum + safeFloat(snap.current_value), 0);
    const totalPatrimonio = totalInvestments + totalCash;

    // Calculate first recorded patrimony for growth
    const firstPatrimony = useMemo(() => {
        const allDates = [
            ...investments.map(i => new Date(i.date)),
            ...cashSnapshots.map(c => new Date(c.date))
        ].filter(d => !isNaN(d.getTime())).sort((a, b) => a - b);

        if (allDates.length === 0) return 0;

        const firstMonth = allDates[0];
        const firstMonthInv = investments.filter(i => {
            const d = new Date(i.date);
            return !isNaN(d.getTime()) && d.getMonth() === firstMonth.getMonth() && d.getFullYear() === firstMonth.getFullYear();
        });
        const firstMonthCash = cashSnapshots.filter(c => {
            const d = new Date(c.date);
            return !isNaN(d.getTime()) && d.getMonth() === firstMonth.getMonth() && d.getFullYear() === firstMonth.getFullYear();
        });

        const invValue = firstMonthInv.reduce((sum, i) => sum + safeFloat(i.current_value), 0);
        const cashValue = firstMonthCash.reduce((sum, c) => sum + safeFloat(c.current_value), 0);

        return invValue + cashValue;
    }, [investments, cashSnapshots]);

    const growthSinceStart = firstPatrimony > 0
        ? ((totalPatrimonio - firstPatrimony) / firstPatrimony) * 100
        : 0;
    const absoluteGrowth = totalPatrimonio - firstPatrimony;

    // Working money percentage (investments / total)
    const workingMoneyPct = totalPatrimonio > 0 ? (totalInvestments / totalPatrimonio) * 100 : 0;

    // Distribution
    const distributionData = [
        { name: 'Inversiones', value: totalInvestments },
        { name: 'Efectivo', value: totalCash },
    ].filter((d) => d.value > 0);

    // Detail by account with return calculation
    const allAccounts = useMemo(() => {
        const accounts = [];

        Object.entries(investmentsByAccount).forEach(([account, inv]) => {
            const contrib = contributionsByAccount[account] || 0;
            const value = safeFloat(inv.current_value);
            const gain = value - contrib;
            const returnPct = contrib !== 0 ? (gain / contrib) * 100 : 0;

            accounts.push({
                type: 'Inversión',
                account,
                value,
                contrib,
                gain,
                returnPct,
                weight: totalPatrimonio > 0 ? (value / totalPatrimonio) * 100 : 0
            });
        });

        Object.entries(cashByAccount).forEach(([account, snap]) => {
            const value = safeFloat(snap.current_value);
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

    // Calculate YTD if we have January data
    const ytdGrowth = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const januarySnapshots = cashSnapshots.filter(
            (s) => new Date(s.date).getFullYear() === currentYear && new Date(s.date).getMonth() === 0
        );
        const januaryInvestments = investments.filter(
            (i) => new Date(i.date).getFullYear() === currentYear && new Date(i.date).getMonth() === 0
        );

        if (januarySnapshots.length === 0 && januaryInvestments.length === 0) return null;

        const janCash = januarySnapshots.reduce((sum, s) => sum + parseFloat(s.current_value), 0);
        const janInv = januaryInvestments.reduce((sum, i) => sum + parseFloat(i.current_value), 0);
        const janTotal = janCash + janInv;

        if (janTotal <= 0) return null;
        return ((totalPatrimonio - janTotal) / janTotal) * 100;
    }, [cashSnapshots, investments, totalPatrimonio]);

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

            {/* Distribution */}
            <div className="chart-container">
                <h3 className="chart-title">Distribución del patrimonio</h3>
                {distributionData.every(d => d.value > 0) && distributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={distributionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {distributionData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex-center" style={{ height: '300px' }}>
                        <p className="text-muted">No hay datos suficientes para mostrar el gráfico</p>
                    </div>
                )}
                <div className="tooltip-container" style={{ textAlign: 'center', marginTop: 'var(--spacing-sm)' }}>
                    <span className="tooltip-trigger">ℹ️ ¿Qué significa esto?</span>
                    <div className="tooltip-content" style={{ whiteSpace: 'normal', maxWidth: '250px' }}>
                        {workingMoneyPct.toFixed(0)}% de tu dinero está invertido y trabajando para ti
                    </div>
                </div>
            </div>

            {/* By Account */}
            <div className="chart-container">
                <h3 className="chart-title">Valor por cuenta</h3>
                {allAccounts.some(a => a.value > 0) ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={allAccounts.slice(0, 8)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="account" width={120} />
                            <Tooltip formatter={(value) => formatCurrency(value)} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {allAccounts.slice(0, 8).map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.type === 'Inversión' ? '#10B981' : '#3B82F6'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex-center" style={{ height: '300px' }}>
                        <p className="text-muted">No hay datos para mostrar</p>
                    </div>
                )}
            </div>

            {/* Detail Table */}
            <div className="card mt-lg">
                <div className="card-header"><h3>Detalle por cuenta</h3></div>
                <div className="card-body">
                    {allAccounts.length === 0 ? (
                        <div className="empty-state"><p>No hay datos de patrimonio registrados</p></div>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Cuenta</th>
                                        <th>Valor actual</th>
                                        <th>Rendimiento</th>
                                        <th>% del total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allAccounts.map((acc, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <span className={`badge ${acc.type === 'Inversión' ? 'badge-success' : 'badge-primary'}`}>
                                                    {acc.type}
                                                </span>
                                            </td>
                                            <td className="font-semibold">{acc.account}</td>
                                            <td>{formatCurrency(acc.value)}</td>
                                            <td>
                                                {acc.type === 'Inversión' ? (
                                                    <span className={acc.returnPct >= 0 ? 'text-success' : 'text-danger'}>
                                                        <span className={`trend ${acc.returnPct >= 0 ? 'trend-up' : 'trend-down'}`}>
                                                            {Math.abs(acc.returnPct).toFixed(1)}%
                                                        </span>
                                                        {' '}({formatCurrency(acc.gain)})
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div className="progress" style={{ width: '60px', height: '6px' }}>
                                                        <div
                                                            className="progress-bar"
                                                            style={{ width: `${acc.weight}%` }}
                                                        />
                                                    </div>
                                                    <span>{acc.weight.toFixed(1)}%</span>
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
