'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function InversionesResumenPage() {
    const [investments, setInvestments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/investments')
            .then((res) => res.json())
            .then(setInvestments)
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
            <div>
                <div className="page-header">
                    <h1 className="page-title">Resumen de inversiones</h1>
                </div>
                <div className="alert alert-info">No hay inversiones registradas todavía.</div>
            </div>
        );
    }

    // Ordenar por cuenta y fecha
    const sorted = [...investments].sort((a, b) => {
        if (a.account !== b.account) return a.account.localeCompare(b.account);
        return new Date(a.date) - new Date(b.date);
    });

    // Calcular aportación acumulada por cuenta
    const accountData = {};
    sorted.forEach((inv) => {
        if (!accountData[inv.account]) {
            accountData[inv.account] = { totalContrib: 0, currentValue: 0, assetType: inv.asset_type };
        }
        accountData[inv.account].totalContrib += parseFloat(inv.contribution);
        accountData[inv.account].currentValue = parseFloat(inv.current_value);
    });

    // Calcular ganancia y rentabilidad
    const accountSummary = Object.entries(accountData).map(([account, data]) => ({
        account,
        assetType: data.assetType,
        aportado: data.totalContrib,
        valor: data.currentValue,
        gain: data.currentValue - data.totalContrib,
        returnPct: data.totalContrib !== 0 ? ((data.currentValue - data.totalContrib) / data.totalContrib) * 100 : 0,
    }));

    // KPIs totales
    const totalAportado = accountSummary.reduce((sum, a) => sum + a.aportado, 0);
    const totalValor = accountSummary.reduce((sum, a) => sum + a.valor, 0);
    const totalGain = totalValor - totalAportado;
    const totalReturn = totalAportado !== 0 ? (totalGain / totalAportado) * 100 : 0;

    // Distribución por cuenta para gráfico
    const distData = accountSummary.map((a) => ({ name: a.account, value: a.valor })).sort((a, b) => b.value - a.value);

    // Evolución temporal (valor total por fecha)
    const dateValues = {};
    sorted.forEach((inv) => {
        const dateKey = inv.date.split('T')[0];
        if (!dateValues[dateKey]) dateValues[dateKey] = 0;
        dateValues[dateKey] = parseFloat(inv.current_value);
    });
    // Acumular por fecha sumando todas las cuentas
    const evolutionData = Object.entries(dateValues)
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Resumen de inversiones</h1>
                <p className="page-subtitle">Vista general de tu cartera de inversión</p>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-label">Capital aportado</div>
                    <div className="kpi-value">{formatCurrency(totalAportado)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Valor actual</div>
                    <div className="kpi-value">{formatCurrency(totalValor)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Plusvalía</div>
                    <div className={`kpi-value ${totalGain >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                        {formatCurrency(totalGain)}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Rentabilidad</div>
                    <div className={`kpi-value ${totalReturn >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                        {totalReturn.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Distribución */}
            <div className="chart-container">
                <h3 className="chart-title">Distribución de la cartera</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={distData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis type="category" dataKey="name" width={150} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Evolución */}
            {evolutionData.length > 1 && (
                <div className="chart-container">
                    <h3 className="chart-title">Evolución del valor total</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={evolutionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="date" />
                            <YAxis tickFormatter={(v) => formatCurrency(v)} />
                            <Tooltip formatter={(v) => formatCurrency(v)} />
                            <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Tabla detalle */}
            <div className="card">
                <div className="card-header"><h3>Detalle por cuenta</h3></div>
                <div className="card-body">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Cuenta</th>
                                    <th>Tipo</th>
                                    <th>Aportado</th>
                                    <th>Valor actual</th>
                                    <th>Plusvalía</th>
                                    <th>Rentabilidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accountSummary.map((a) => (
                                    <tr key={a.account}>
                                        <td className="font-semibold">{a.account}</td>
                                        <td><span className="badge badge-primary">{a.assetType}</span></td>
                                        <td>{formatCurrency(a.aportado)}</td>
                                        <td>{formatCurrency(a.valor)}</td>
                                        <td className={a.gain >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(a.gain)}</td>
                                        <td className={a.returnPct >= 0 ? 'text-success' : 'text-danger'}>{a.returnPct.toFixed(2)}%</td>
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
