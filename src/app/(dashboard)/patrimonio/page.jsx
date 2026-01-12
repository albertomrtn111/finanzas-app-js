'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function PatrimonioPage() {
    const [investments, setInvestments] = useState([]);
    const [cashSnapshots, setCashSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch('/api/investments').then((r) => r.json()),
            fetch('/api/cash').then((r) => r.json()),
        ])
            .then(([inv, cash]) => {
                setInvestments(inv);
                setCashSnapshots(cash);
            })
            .finally(() => setLoading(false));
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    if (loading) {
        return <div className="flex-center" style={{ minHeight: '400px' }}><div className="spinner"></div></div>;
    }

    // Calcular valor inversiones por cuenta (último registro)
    const investmentsByAccount = {};
    investments.forEach((inv) => {
        if (!investmentsByAccount[inv.account] || new Date(inv.date) > new Date(investmentsByAccount[inv.account].date)) {
            investmentsByAccount[inv.account] = inv;
        }
    });
    const totalInvestments = Object.values(investmentsByAccount).reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);

    // Calcular efectivo por cuenta (último registro)
    const cashByAccount = {};
    cashSnapshots.forEach((snap) => {
        if (!cashByAccount[snap.account] || new Date(snap.date) > new Date(cashByAccount[snap.account].date)) {
            cashByAccount[snap.account] = snap;
        }
    });
    const totalCash = Object.values(cashByAccount).reduce((sum, snap) => sum + parseFloat(snap.current_value), 0);

    // Patrimonio total
    const totalPatrimonio = totalInvestments + totalCash;

    // Distribución
    const distributionData = [
        { name: 'Inversiones', value: totalInvestments },
        { name: 'Efectivo', value: totalCash },
    ].filter((d) => d.value > 0);

    // Detalle por cuenta
    const allAccounts = [
        ...Object.values(investmentsByAccount).map((inv) => ({
            type: 'Inversión',
            account: inv.account,
            value: parseFloat(inv.current_value),
        })),
        ...Object.values(cashByAccount).map((snap) => ({
            type: 'Efectivo',
            account: snap.account,
            value: parseFloat(snap.current_value),
        })),
    ].sort((a, b) => b.value - a.value);

    // Calculamos YTD si hay datos de enero
    const currentYear = new Date().getFullYear();
    const januarySnapshots = cashSnapshots.filter(
        (s) => new Date(s.date).getFullYear() === currentYear && new Date(s.date).getMonth() === 0
    );
    const januaryInvestments = investments.filter(
        (i) => new Date(i.date).getFullYear() === currentYear && new Date(i.date).getMonth() === 0
    );
    let ytdGrowth = null;
    if (januarySnapshots.length > 0 || januaryInvestments.length > 0) {
        const janCash = januarySnapshots.reduce((sum, s) => sum + parseFloat(s.current_value), 0);
        const janInv = januaryInvestments.reduce((sum, i) => sum + parseFloat(i.current_value), 0);
        const janTotal = janCash + janInv;
        if (janTotal > 0) {
            ytdGrowth = ((totalPatrimonio - janTotal) / janTotal) * 100;
        }
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Patrimonio</h1>
                <p className="page-subtitle">Vista consolidada de inversiones y efectivo</p>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-label">Patrimonio total</div>
                    <div className="kpi-value">{formatCurrency(totalPatrimonio)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Inversiones</div>
                    <div className="kpi-value text-success">{formatCurrency(totalInvestments)}</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label">Efectivo</div>
                    <div className="kpi-value" style={{ color: 'var(--primary)' }}>{formatCurrency(totalCash)}</div>
                </div>
                {ytdGrowth !== null && (
                    <div className="kpi-card">
                        <div className="kpi-label">Crecimiento YTD</div>
                        <div className={`kpi-value ${ytdGrowth >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {ytdGrowth.toFixed(1)}%
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-2 gap-lg">
                {/* Distribución */}
                {distributionData.length > 0 && (
                    <div className="chart-container">
                        <h3 className="chart-title">Distribución del patrimonio</h3>
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
                                <Tooltip formatter={(v) => formatCurrency(v)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Por cuenta */}
                {allAccounts.length > 0 && (
                    <div className="chart-container">
                        <h3 className="chart-title">Valor por cuenta</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={allAccounts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                                <YAxis type="category" dataKey="account" width={120} />
                                <Tooltip formatter={(v) => formatCurrency(v)} />
                                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Tabla detalle */}
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
                                        <th>% del total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allAccounts.map((acc, idx) => (
                                        <tr key={idx}>
                                            <td><span className={`badge ${acc.type === 'Inversión' ? 'badge-success' : 'badge-primary'}`}>{acc.type}</span></td>
                                            <td className="font-semibold">{acc.account}</td>
                                            <td>{formatCurrency(acc.value)}</td>
                                            <td>{totalPatrimonio > 0 ? ((acc.value / totalPatrimonio) * 100).toFixed(1) : 0}%</td>
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
