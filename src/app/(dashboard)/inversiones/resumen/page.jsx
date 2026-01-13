'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend, PieChart, Pie, Cell
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

export default function InversionesResumenPage() {
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/investments')
            .then((res) => res.ok ? res.json() : [])
            .then((data) => setInvestments(Array.isArray(data) ? data : []))
            .catch((error) => console.error('Error loading investments:', error))
            .finally(() => setLoading(false));
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    if (investments.length === 0) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h1 className="page-title">Resumen de inversiones</h1>
                </div>
                <div className="alert alert-info">No hay inversiones registradas todavía.</div>
            </div>
        );
    }

    // Sort by account and date
    const sorted = [...investments].sort((a, b) => {
        if (a.account !== b.account) return a.account.localeCompare(b.account);
        return new Date(a.date) - new Date(b.date);
    });

    // Calculate cumulative contributions per account
    const accountData = {};
    sorted.forEach((inv) => {
        if (!accountData[inv.account]) {
            accountData[inv.account] = { totalContrib: 0, currentValue: 0, assetType: inv.asset_type };
        }
        accountData[inv.account].totalContrib += parseFloat(inv.contribution);
        accountData[inv.account].currentValue = parseFloat(inv.current_value);
    });

    // Account summary with gain/return
    const accountSummary = Object.entries(accountData).map(([account, data]) => ({
        account,
        assetType: data.assetType,
        aportado: data.totalContrib,
        valor: data.currentValue,
        gain: data.currentValue - data.totalContrib,
        returnPct: data.totalContrib !== 0 ? ((data.currentValue - data.totalContrib) / data.totalContrib) * 100 : 0,
    }));

    // Total KPIs
    const totalAportado = accountSummary.reduce((sum, a) => sum + a.aportado, 0);
    const totalValor = accountSummary.reduce((sum, a) => sum + a.valor, 0);
    const totalGain = totalValor - totalAportado;
    const totalReturn = totalAportado !== 0 ? (totalGain / totalAportado) * 100 : 0;

    // Calculate portfolio weight per account
    const accountsWithWeight = accountSummary
        .map(a => ({ ...a, weight: totalValor > 0 ? (a.valor / totalValor) * 100 : 0 }))
        .sort((a, b) => b.weight - a.weight);

    // Portfolio Health Metrics
    const uniqueAccounts = accountSummary.length;
    const maxWeight = Math.max(...accountsWithWeight.map(a => a.weight));

    const getDiversification = () => {
        if (uniqueAccounts >= 5) return { level: 'high', label: 'Alta', desc: `${uniqueAccounts} activos diferentes` };
        if (uniqueAccounts >= 3) return { level: 'medium', label: 'Media', desc: `${uniqueAccounts} activos` };
        return { level: 'low', label: 'Baja', desc: `Solo ${uniqueAccounts} activo(s)` };
    };

    const getConcentrationRisk = () => {
        if (maxWeight > 50) return { level: 'low', label: 'Alto riesgo', desc: `${maxWeight.toFixed(0)}% en un solo activo` };
        if (maxWeight > 30) return { level: 'medium', label: 'Moderado', desc: `${maxWeight.toFixed(0)}% en mayor posición` };
        return { level: 'high', label: 'Bajo riesgo', desc: 'Buena distribución' };
    };

    const diversification = getDiversification();
    const concentration = getConcentrationRisk();

    // Distribution by asset type
    const byAssetType = {};
    accountSummary.forEach(a => {
        if (!byAssetType[a.assetType]) byAssetType[a.assetType] = 0;
        byAssetType[a.assetType] += a.valor;
    });
    const assetTypeData = Object.entries(byAssetType)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Evolution data: contributions vs market value over time
    const dateMap = {};
    let cumulativeContrib = 0;
    sorted.forEach((inv) => {
        const dateKey = inv.date.split('T')[0];
        cumulativeContrib += parseFloat(inv.contribution);
        if (!dateMap[dateKey]) {
            dateMap[dateKey] = { date: dateKey, aportado: 0, valor: 0 };
        }
        dateMap[dateKey].aportado = cumulativeContrib;
        dateMap[dateKey].valor = parseFloat(inv.current_value);
    });

    // Accumulate value across all accounts per date
    const evolutionData = Object.values(dateMap)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Recalculate with proper accumulation
    const evolutionWithAccumulation = [];
    let runningContrib = 0;
    const lastValueByAccount = {};

    sorted.forEach((inv) => {
        runningContrib += parseFloat(inv.contribution);
        lastValueByAccount[inv.account] = parseFloat(inv.current_value);
        const totalCurrentValue = Object.values(lastValueByAccount).reduce((s, v) => s + v, 0);

        evolutionWithAccumulation.push({
            date: inv.date.split('T')[0],
            aportado: runningContrib,
            valor: totalCurrentValue
        });
    });

    // Distribution chart data
    const distData = accountSummary.map((a) => ({ name: a.account, value: a.valor })).sort((a, b) => b.value - a.value);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Resumen de inversiones</h1>
                <p className="page-subtitle">Vista general de tu cartera de inversión</p>
            </div>

            {/* Portfolio Health */}
            <div className="status-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div>
                    <div className="status-header-title">Salud de la cartera</div>
                    <div className="status-header-subtitle">Análisis de diversificación y riesgo</div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="tooltip-container">
                        <div className={`health-indicator ${diversification.level}`}>
                            Diversificación: {diversification.label}
                        </div>
                        <div className="tooltip-content">{diversification.desc}</div>
                    </div>
                    <div className="tooltip-container">
                        <div className={`health-indicator ${concentration.level}`}>
                            Concentración: {concentration.label}
                        </div>
                        <div className="tooltip-content">{concentration.desc}</div>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Capital aportado</div>
                    <div className="kpi-value">{formatCurrency(totalAportado)}</div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Valor actual</div>
                    <div className="kpi-value">{formatCurrency(totalValor)}</div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Plusvalía</div>
                    <div className={`kpi-value ${totalGain >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                        {formatCurrency(totalGain)}
                    </div>
                    <div className="kpi-trend">
                        <span className={`trend ${totalGain >= 0 ? 'trend-up' : 'trend-down'}`}>
                            {Math.abs(totalReturn).toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Nº de posiciones</div>
                    <div className="kpi-value">{uniqueAccounts}</div>
                </div>
            </div>

            {/* Distribution by Asset Type */}
            <div className="grid grid-2 gap-lg">
                <div className="chart-container">
                    <h3 className="chart-title">Distribución por tipo de activo</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={assetTypeData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {assetTypeData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v) => formatCurrency(v)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-container">
                    <h3 className="chart-title">Distribución por producto</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={distData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                            <YAxis type="category" dataKey="name" width={120} />
                            <Tooltip formatter={(v) => formatCurrency(v)} />
                            <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Evolution Chart - Dual Line */}
            {evolutionWithAccumulation.length > 1 && (
                <div className="chart-container">
                    <h3 className="chart-title">Evolución: Aportaciones vs Valor de mercado</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={evolutionWithAccumulation}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="date" />
                            <YAxis tickFormatter={(v) => formatCurrency(v)} />
                            <Tooltip formatter={(v) => formatCurrency(v)} />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="aportado"
                                stroke="#6B7280"
                                strokeWidth={2}
                                dot={false}
                                name="Aportaciones"
                            />
                            <Line
                                type="monotone"
                                dataKey="valor"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                dot={false}
                                name="Valor mercado"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                    <p className="text-muted text-sm mt-sm">
                        {totalGain >= 0
                            ? `📈 Tu inversión ha generado ${formatCurrency(totalGain)} de plusvalía`
                            : `📉 Tu cartera tiene una minusvalía de ${formatCurrency(Math.abs(totalGain))}`
                        }
                    </p>
                </div>
            )}

            {/* Detail Table with Weight */}
            <div className="card">
                <div className="card-header"><h3>Detalle por cuenta</h3></div>
                <div className="card-body">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Cuenta</th>
                                    <th>Tipo</th>
                                    <th>Peso cartera</th>
                                    <th>Aportado</th>
                                    <th>Valor actual</th>
                                    <th>Plusvalía</th>
                                    <th>Rentabilidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accountsWithWeight.map((a) => (
                                    <tr key={a.account}>
                                        <td className="font-semibold">{a.account}</td>
                                        <td><span className="badge badge-primary">{a.assetType}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div className="progress" style={{ width: '60px', height: '6px' }}>
                                                    <div
                                                        className="progress-bar"
                                                        style={{ width: `${a.weight}%` }}
                                                    />
                                                </div>
                                                <span>{a.weight.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td>{formatCurrency(a.aportado)}</td>
                                        <td>{formatCurrency(a.valor)}</td>
                                        <td className={a.gain >= 0 ? 'text-success' : 'text-danger'}>
                                            {formatCurrency(a.gain)}
                                        </td>
                                        <td className={a.returnPct >= 0 ? 'text-success' : 'text-danger'}>
                                            <span className={`trend ${a.returnPct >= 0 ? 'trend-up' : 'trend-down'}`}>
                                                {Math.abs(a.returnPct).toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
