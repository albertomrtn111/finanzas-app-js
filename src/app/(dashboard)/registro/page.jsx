'use client';

import { useState, useEffect } from 'react';

export default function RegistroPage() {
    const [mode, setMode] = useState('gastos');
    const [expenses, setExpenses] = useState([]);
    const [incomes, setIncomes] = useState([]);
    const [expenseCategories, setExpenseCategories] = useState([]);
    const [incomeCategories, setIncomeCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [editingId, setEditingId] = useState(null);

    // Initial states for resetting
    const initialExpenseForm = {
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: '',
        subcategory: '',
        payment_method: 'Tarjeta',
        expense_type: 'Variable',
        notes: '',
    };

    const initialIncomeForm = {
        date: new Date().toISOString().split('T')[0],
        amount: '',
        source: '',
        category: '',
        notes: '',
    };

    // Form states
    const [expenseForm, setExpenseForm] = useState(initialExpenseForm);
    const [incomeForm, setIncomeForm] = useState(initialIncomeForm);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [expRes, incRes, expCatRes, incCatRes] = await Promise.all([
                fetch('/api/expenses'),
                fetch('/api/income'),
                fetch('/api/categories?type=expense'),
                fetch('/api/categories?type=income'),
            ]);

            if (expRes.ok) setExpenses(await expRes.json());
            if (incRes.ok) setIncomes(await incRes.json());
            if (expCatRes.ok) {
                const cats = await expCatRes.json();
                setExpenseCategories(cats);
                if (cats.length > 0 && !expenseForm.category) setExpenseForm(f => ({ ...f, category: cats[0].name }));
            }
            if (incCatRes.ok) {
                const cats = await incCatRes.json();
                setIncomeCategories(cats);
                if (cats.length > 0 && !incomeForm.category) setIncomeForm(f => ({ ...f, category: cats[0].name }));
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

    const cancelEdit = () => {
        setEditingId(null);
        setExpenseForm({
            ...initialExpenseForm,
            category: expenseCategories.length > 0 ? expenseCategories[0].name : ''
        });
        setIncomeForm({
            ...initialIncomeForm,
            category: incomeCategories.length > 0 ? incomeCategories[0].name : ''
        });
    };

    const handleEditExpense = (exp) => {
        setMode('gastos');
        setEditingId(exp.id);
        setExpenseForm({
            date: exp.date.split('T')[0],
            amount: exp.amount,
            category: exp.category,
            subcategory: exp.subcategory || '',
            payment_method: exp.payment_method,
            expense_type: exp.expense_type || 'Variable',
            notes: exp.notes || '',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleEditIncome = (inc) => {
        setMode('ingresos');
        setEditingId(inc.id);
        setIncomeForm({
            date: inc.date.split('T')[0],
            amount: inc.amount,
            source: inc.source || '',
            category: inc.category,
            notes: inc.notes || '',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) {
            showMessage('error', 'El importe debe ser mayor que 0');
            return;
        }

        setSaving(true);
        try {
            const method = editingId ? 'PUT' : 'POST';
            const body = editingId ? { ...expenseForm, id: editingId } : expenseForm;

            const res = await fetch('/api/expenses', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                showMessage('success', `Gasto ${editingId ? 'actualizado' : 'guardado'} correctamente`);
                cancelEdit();
                loadData();
            } else {
                showMessage('error', `Error al ${editingId ? 'actualizar' : 'guardar'} el gasto`);
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleSubmitIncome = async (e) => {
        e.preventDefault();
        if (!incomeForm.amount || parseFloat(incomeForm.amount) <= 0) {
            showMessage('error', 'El importe debe ser mayor que 0');
            return;
        }

        setSaving(true);
        try {
            const method = editingId ? 'PUT' : 'POST';
            const body = editingId ? { ...incomeForm, id: editingId } : incomeForm;

            const res = await fetch('/api/income', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                showMessage('success', `Ingreso ${editingId ? 'actualizado' : 'guardado'} correctamente`);
                cancelEdit();
                loadData();
            } else {
                showMessage('error', `Error al ${editingId ? 'actualizar' : 'guardar'} el ingreso`);
            }
        } catch (error) {
            showMessage('error', 'Error de conexión');
        }
        setSaving(false);
    };

    const handleDeleteExpense = async (id) => {
        if (!confirm('¿Eliminar este gasto?')) return;
        try {
            const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Gasto eliminado');
                if (editingId === id) cancelEdit();
                loadData();
            }
        } catch (error) {
            showMessage('error', 'Error al eliminar');
        }
    };

    const handleDeleteIncome = async (id) => {
        if (!confirm('¿Eliminar este ingreso?')) return;
        try {
            const res = await fetch(`/api/income?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showMessage('success', 'Ingreso eliminado');
                if (editingId === id) cancelEdit();
                loadData();
            }
        } catch (error) {
            showMessage('error', 'Error al eliminar');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('es-ES');
    };

    if (loading) {
        return (
            <div className="flex-center" style={{ minHeight: '400px' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Registro de movimientos</h1>
                <p className="page-subtitle">Registra y edita tus gastos e ingresos</p>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'}`}>
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${mode === 'gastos' ? 'active' : ''}`}
                    onClick={() => { setMode('gastos'); cancelEdit(); }}
                >
                    Gastos
                </button>
                <button
                    className={`tab ${mode === 'ingresos' ? 'active' : ''}`}
                    onClick={() => { setMode('ingresos'); cancelEdit(); }}
                >
                    Ingresos
                </button>
            </div>

            {/* GASTOS */}
            {mode === 'gastos' && (
                <>
                    <div className="card mb-lg">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>{editingId ? 'Editar gasto' : 'Nuevo gasto'}</h3>
                            {editingId && (
                                <button className="btn btn-sm btn-outline" onClick={cancelEdit}>
                                    Cancelar edición
                                </button>
                            )}
                        </div>
                        <div className="card-body">
                            {expenseCategories.length === 0 ? (
                                <div className="alert alert-warning">
                                    No tienes categorías de gasto. Ve a Categorías para crear al menos una.
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitExpense}>
                                    <div className="grid grid-2 gap-md">
                                        <div className="form-group">
                                            <label className="form-label">Fecha</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={expenseForm.date}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Importe (€)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="form-input"
                                                placeholder="0.00"
                                                value={expenseForm.amount}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Categoría</label>
                                            <select
                                                className="form-input form-select"
                                                value={expenseForm.category}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                            >
                                                {expenseCategories.map((cat) => (
                                                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Subcategoría (opcional)</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="ej: Netflix"
                                                value={expenseForm.subcategory}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, subcategory: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Método de pago</label>
                                            <select
                                                className="form-input form-select"
                                                value={expenseForm.payment_method}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                                            >
                                                <option>Tarjeta</option>
                                                <option>Efectivo</option>
                                                <option>Bizum</option>
                                                <option>Transferencia</option>
                                                <option>Otro</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Tipo de gasto</label>
                                            <select
                                                className="form-input form-select"
                                                value={expenseForm.expense_type}
                                                onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}
                                            >
                                                <option>Variable</option>
                                                <option>Fijo</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notas (opcional)</label>
                                        <textarea
                                            className="form-input"
                                            rows="2"
                                            value={expenseForm.notes}
                                            onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>
                                            {saving ? 'Guardando...' : editingId ? 'Actualizar gasto' : 'Guardar gasto'}
                                        </button>
                                        {editingId && (
                                            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h3>Últimos gastos</h3>
                        </div>
                        <div className="card-body">
                            {expenses.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">📝</div>
                                    <p>No hay gastos registrados</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Fecha</th>
                                                <th>Importe</th>
                                                <th>Categoría</th>
                                                <th>Subcategoría</th>
                                                <th>Método</th>
                                                <th>Tipo</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenses.slice(0, 20).map((exp) => (
                                                <tr key={exp.id} className={editingId === exp.id ? 'bg-highlight' : ''}>
                                                    <td>{formatDate(exp.date)}</td>
                                                    <td className="font-semibold">{formatCurrency(exp.amount)}</td>
                                                    <td><span className="badge badge-primary">{exp.category}</span></td>
                                                    <td className="text-muted">{exp.subcategory || '-'}</td>
                                                    <td className="text-sm">{exp.payment_method}</td>
                                                    <td className="text-sm">{exp.expense_type}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button
                                                                className="btn btn-icon btn-secondary"
                                                                onClick={() => handleEditExpense(exp)}
                                                                title="Editar"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                className="btn btn-icon btn-danger"
                                                                onClick={() => handleDeleteExpense(exp.id)}
                                                                title="Eliminar"
                                                            >
                                                                🗑️
                                                            </button>
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
                </>
            )}

            {/* INGRESOS */}
            {mode === 'ingresos' && (
                <>
                    <div className="card mb-lg">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>{editingId ? 'Editar ingreso' : 'Nuevo ingreso'}</h3>
                            {editingId && (
                                <button className="btn btn-sm btn-outline" onClick={cancelEdit}>
                                    Cancelar edición
                                </button>
                            )}
                        </div>
                        <div className="card-body">
                            {incomeCategories.length === 0 ? (
                                <div className="alert alert-warning">
                                    No tienes categorías de ingreso. Ve a Categorías para crear al menos una.
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitIncome}>
                                    <div className="grid grid-2 gap-md">
                                        <div className="form-group">
                                            <label className="form-label">Fecha</label>
                                            <input
                                                type="date"
                                                className="form-input"
                                                value={incomeForm.date}
                                                onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Importe (€)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                className="form-input"
                                                placeholder="0.00"
                                                value={incomeForm.amount}
                                                onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Fuente</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="ej: Nómina, Freelance..."
                                                value={incomeForm.source}
                                                onChange={(e) => setIncomeForm({ ...incomeForm, source: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Categoría</label>
                                            <select
                                                className="form-input form-select"
                                                value={incomeForm.category}
                                                onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}
                                            >
                                                {incomeCategories.map((cat) => (
                                                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notas (opcional)</label>
                                        <textarea
                                            className="form-input"
                                            rows="2"
                                            value={incomeForm.notes}
                                            onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="submit" className="btn btn-success" disabled={saving}>
                                            {saving ? 'Guardando...' : editingId ? 'Actualizar ingreso' : 'Guardar ingreso'}
                                        </button>
                                        {editingId && (
                                            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h3>Últimos ingresos</h3>
                        </div>
                        <div className="card-body">
                            {incomes.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">💵</div>
                                    <p>No hay ingresos registrados</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Fecha</th>
                                                <th>Importe</th>
                                                <th>Fuente</th>
                                                <th>Categoría</th>
                                                <th>Notas</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {incomes.slice(0, 20).map((inc) => (
                                                <tr key={inc.id} className={editingId === inc.id ? 'bg-highlight' : ''}>
                                                    <td>{formatDate(inc.date)}</td>
                                                    <td className="font-semibold text-success">{formatCurrency(inc.amount)}</td>
                                                    <td>{inc.source || '-'}</td>
                                                    <td><span className="badge badge-success">{inc.category}</span></td>
                                                    <td className="text-muted text-sm">{inc.notes || '-'}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button
                                                                className="btn btn-icon btn-secondary"
                                                                onClick={() => handleEditIncome(inc)}
                                                                title="Editar"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                className="btn btn-icon btn-danger"
                                                                onClick={() => handleDeleteIncome(inc.id)}
                                                                title="Eliminar"
                                                            >
                                                                🗑️
                                                            </button>
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
                </>
            )}
        </div>
    );
}
