'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    LineChart, Line, Legend, PieChart, Pie, Cell
} from 'recharts';
import ChartContainer from '@/components/ChartContainer';
import CustomTooltip from '@/components/charts/CustomTooltip';
import { renderPieLabel } from '@/lib/chartUtils';


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

    // Refresh keys
    const assetTypeRefreshKey = assetTypeData.length > 0
        ? assetTypeData.map(d => d.value.toFixed(0)).join('-')
        : '0';

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

    const evolutionRefreshKey = evolutionWithAccumulation.length;

    // Distribution chart data
    const distData = accountSummary.map((a) => ({ name: a.account, value: a.valor })).sort((a, b) => b.value - a.value);
    const distRefreshKey = distData.length > 0
        ? distData.slice(0, 6).map(d => d.value.toFixed(0)).join('-')
        : '0';

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

            {/* Charts Grid */}
            <div className="grid grid-2 gap-lg">
                <ChartContainer
                    title="Distribución por tipo de activo"
                    heightMobile={300}
                    heightDesktop={280}
                    className="chart-pie"
                    refreshKey={assetTypeRefreshKey}
                    render={({ width, height }) => {
                        const size = Math.min(width, height);
                        const outerR = size * 0.38;
                        const innerR = size * 0.25;
                        return (
                            <PieChart width={width} height={height}>
                                <Pie
                                    data={assetTypeData}
                                    cx={width / 2}
                                    cy={height / 2}
                                    innerRadius={innerR}
                                    outerRadius={outerR}
                                    dataKey="value"
                                    labelLine={false}
                                    label={renderPieLabel}
                                >
                                    {assetTypeData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip formatter={formatCurrency} totalValue={totalValor} />} />
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

                <ChartContainer
                    title="Distribución por producto"
                    heightMobile={300}
                    heightDesktop={280}
                    className="chart-bar"
                    refreshKey={distRefreshKey}
                    render={({ width, height, isMobile }) => (
                        <BarChart
                            width={width}
                            height={height}
                            data={distData.slice(0, 6)}
                            layout="vertical"
                            margin={{ left: 5, right: 15, top: 5, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                type="number"
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 10 }}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={isMobile ? 60 : 70}
                                tick={{ fontSize: isMobile ? 9 : 10 }}
                                tickFormatter={(v) => v.length > (isMobile ? 10 : 12) ? v.substring(0, isMobile ? 10 : 12) + '…' : v}
                            />
                            <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                            <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} maxBarSize={30} />
                        </BarChart>
                    )}
                />
            </div>

            {/* Evolution Chart - Dual Line */}
            {evolutionWithAccumulation.length > 1 && (
                <ChartContainer
                    title="Evolución: Aportaciones vs Valor"
                    heightMobile={280}
                    heightDesktop={260}
                    className="chart-line"
                    refreshKey={evolutionRefreshKey}
                    render={({ width, height, isMobile }) => (
                        <LineChart
                            width={width}
                            height={height}
                            data={evolutionWithAccumulation}
                            margin={{ left: 0, right: isMobile ? 10 : 20, top: 10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) => v.substring(5)}
                            />
                            <YAxis
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 10 }}
                                width={40}
                            />
                            <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="aportado"
                                stroke="#6B7280"
                                strokeWidth={2}
                                dot={false}
                                name="Aportado"
                            />
                            <Line
                                type="monotone"
                                dataKey="valor"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                dot={false}
                                name="Valor"
                            />
                        </LineChart>
                    )}
                />
            )}

            {evolutionWithAccumulation.length > 1 && (
                <p className="text-muted text-sm mt-sm" style={{ marginBottom: '2rem' }}>
                    {totalGain >= 0
                        ? `📈 Plusvalía: ${formatCurrency(totalGain)}`
                        : `📉 Minusvalía: ${formatCurrency(Math.abs(totalGain))}`
                    }
                </p>
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
