'use client';

import { useState, useEffect } from 'react';

export default function PresupuestosPage() {
    const [categories, setCategories] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [catRes, budRes] = await Promise.all([
                fetch('/api/categories?type=expense'),
                fetch('/api/budgets'),
            ]);

            if (catRes.ok) {
                const cats = await catRes.json();
                setCategories(cats);

                // Inicializar budgets con valores existentes o 0
                const existingBudgets = budRes.ok ? await budRes.json() : [];
                const budgetMap = {};
                cats.forEach((cat) => {
                    const existing = existingBudgets.find((b) => b.category === cat.name);
                    budgetMap[cat.name] = existing ? parseFloat(existing.monthly_amount) : 0;
                });
                setBudgets(budgetMap);
            }
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
        setLoading(false);
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleChange = (category, value) => {
        setBudgets({ ...budgets, [category]: parseFloat(value) || 0 });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            const budgetArray = Object.entries(budgets).map(([category, monthly_amount]) => ({
                category,
                monthly_amount,
            }));

            const res = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ budgets: budgetArray }),
            });

            if (res.ok) {
                showMessage('success', 'Presupuestos guardados correctamente');
            } else {
                showMessage('error', 'Error al guardar');
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const totalBudget = Object.values(budgets).reduce((sum, val) => sum + val, 0);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Presupuestos mensuales</h1>
                <p className="page-subtitle">
                    Define cuánto quieres gastar al mes en cada categoría
                </p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            {categories.length === 0 ? (
                <div className="alert alert-warning">
                    No hay categorías de gasto definidas. Ve a Categorías para crearlas primero.
                </div>
            ) : (
                <>
                    <div className="kpi-grid" style={{ marginBottom: '2rem' }}>
                        <div className="kpi-card">
                            <div className="kpi-label">Presupuesto mensual total</div>
                            <div className="kpi-value">{formatCurrency(totalBudget)}</div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h3>Presupuestos por categoría</h3>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSave}>
                                <div className="grid grid-2 gap-md">
                                    {categories.map((cat) => (
                                        <div key={cat.id} className="form-group">
                                            <label className="form-label">{cat.name}</label>
                                            <input
                                                type="number"
                                                step="10"
                                                min="0"
                                                className="form-input"
                                                value={budgets[cat.name] || 0}
                                                onChange={(e) => handleChange(cat.name, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving}
                                    style={{ marginTop: '1rem' }}
                                >
                                    {saving ? 'Guardando...' : 'Guardar presupuestos'}
                                </button>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
