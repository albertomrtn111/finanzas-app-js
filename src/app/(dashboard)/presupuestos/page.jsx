'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { compareBudgets, toCents } from '@/lib/personalSummary';
import { formatEuro, formatPct } from '@/lib/moneyFormat';
import { amountToInput, parseAmountInput } from '@/lib/amount';
import { jsonRequest, parseBudgetInputs, requestJson } from '@/lib/utils';
import { AmountInput, EmptyState, Field, LoadState, Money, useFeedback } from '@/components/ui';

// Importe escrito en un campo → número (0 si está vacío o no es válido), para las cuentas en vivo.
const amountValue = (text) => {
    const { value } = parseAmountInput(text, { allowZero: true });
    return value ? Number(value) : 0;
};

const progressColor = (ratio) => (ratio > 90 ? 'red' : ratio > 70 ? 'yellow' : 'green');

export default function PresupuestosPage() {
    const { toast } = useFeedback();
    const [categories, setCategories] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [errors, setErrors] = useState({});
    const [summary, setSummary] = useState(null);
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        setStatus({ loading: true, error: '' });
        try {
            // Gasto e ingresos del mes en curso: los calcula el servidor con el mismo módulo que Resumen y el MCP.
            const now = new Date();
            const params = new URLSearchParams({ period: 'month', year: String(now.getFullYear()), month: String(now.getMonth()) });
            const [cats, existingBudgets, summaryData] = await Promise.all([
                requestJson('/api/categories?type=expense'),
                requestJson('/api/budgets'),
                requestJson(`/api/summary?${params.toString()}`),
            ]);
            const budgetMap = {};
            for (const cat of cats) {
                const existing = existingBudgets.find((b) => b.category === cat.name);
                budgetMap[cat.name] = existing && Number(existing.monthly_amount) ? amountToInput(existing.monthly_amount) : '';
            }
            setCategories(cats);
            setBudgets(budgetMap);
            setErrors({});
            setSummary(summaryData);
            setStatus({ loading: false, error: '' });
        } catch (error) {
            // Si falla la carga no se enseñan presupuestos a 0: guardarlos borraría los que ya hay.
            setStatus({ loading: false, error: error.message });
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

    const handleChange = (category, value) => {
        setBudgets(current => ({ ...current, [category]: value }));
        setErrors(current => ({ ...current, [category]: undefined }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { budgets: budgetArray, errors: nextErrors } = parseBudgetInputs(budgets);
        setErrors(nextErrors);
        const invalid = categories.find(cat => nextErrors[cat.name]);
        if (invalid) {
            document.getElementById(`presupuesto-${invalid.id}`)?.focus();
            toast({ type: 'error', text: 'Revisa los importes marcados antes de guardar' });
            return;
        }

        setSaving(true);
        try {
            await requestJson('/api/budgets', jsonRequest('POST', { budgets: budgetArray }));
            toast({ text: 'Presupuestos guardados' });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    // Gasto del mes por categoría (en céntimos) tal como lo devuelve el servidor.
    const spentByCategory = useMemo(() => new Map(
        (summary?.charts?.categories ?? []).map(c => [c.name, toCents(c.value)])
    ), [summary]);
    const spentOf = (name) => (spentByCategory.get(name) || 0) / 100;

    // Misma comparación que Resumen y el MCP, aplicada a los importes que se están editando:
    // solo cuentan las categorías con presupuesto; el resto se muestra como gasto sin presupuesto.
    const comparison = useMemo(() => compareBudgets({
        budgets: Object.entries(budgets).map(([category, text]) => ({ category, monthly_amount: amountValue(text) })),
        spent: spentByCategory,
        months: 1,
    }), [budgets, spentByCategory]);

    const totalBudget = comparison.total;
    const totalSpent = comparison.spent;
    const currentMonthIncome = summary?.kpi?.income ?? 0;
    const expectedSavings = currentMonthIncome - totalBudget;

    // Categorías con presupuesto que van por encima del 70 %.
    const categoriesAtRisk = comparison.categories
        .filter(cat => (cat.ratio ?? 0) >= 70)
        .map(cat => ({ name: cat.category, budget: cat.budget, spent: cat.spent, ratio: cat.ratio ?? 0 }));

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Presupuestos mensuales</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={loadData} label="Cargando tus presupuestos…" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Presupuestos mensuales</h1>
                <p className="page-subtitle">Define cuánto quieres gastar al mes en cada categoría</p>
            </div>

            {categories.length === 0 ? (
                <div className="card">
                    <EmptyState
                        title="Todavía no hay categorías de gasto"
                        text="Crea tus categorías de gasto para poder ponerles un presupuesto."
                        action={<Link className="btn btn-primary" href="/categorias">Ir a Categorías</Link>}
                    />
                </div>
            ) : (
                <>
                    <div className="kpi-grid mb-lg">
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Presupuesto mensual</div>
                            <div className="kpi-value"><Money value={totalBudget} /></div>
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Gastado en categorías con presupuesto</div>
                            <div className="kpi-value"><Money value={totalSpent} /></div>
                            <div className="kpi-trend">
                                <span className={totalSpent <= totalBudget ? 'text-success' : 'text-danger'}>
                                    {formatPct(comparison.ratio ?? 0)} del presupuesto
                                </span>
                            </div>
                            {comparison.unbudgetedSpent !== 0 && (
                                <div className="text-muted text-sm">
                                    Además, <Money value={comparison.unbudgetedSpent} /> en categorías sin presupuesto
                                </div>
                            )}
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Ahorro esperado</div>
                            <div className="kpi-value"><Money value={expectedSavings} signed /></div>
                            <div className="kpi-trend text-muted text-sm">Ingresos del mes menos el presupuesto</div>
                        </div>
                        <div className="kpi-card-enhanced">
                            <div className="kpi-label">Disponible</div>
                            <div className="kpi-value"><Money value={totalBudget - totalSpent} signed /></div>
                        </div>
                    </div>

                    {categoriesAtRisk.length > 0 && (
                        <section className="card mb-lg" aria-labelledby="presupuestos-riesgo-titulo">
                            <div className="card-body">
                                <h2 id="presupuestos-riesgo-titulo" className="section-title">Categorías en riesgo</h2>
                                <ul className="smart-alerts">
                                    {categoriesAtRisk.map((cat) => (
                                        <li key={cat.name} className={`smart-alert ${cat.ratio >= 100 ? 'danger' : 'warning'}`}>
                                            <div className="smart-alert-content">
                                                <div className="smart-alert-title">{cat.name}{cat.ratio >= 100 ? ': presupuesto superado' : ''}</div>
                                                <div className="smart-alert-desc">
                                                    <Money value={cat.spent} /> de <Money value={cat.budget} /> ({formatPct(cat.ratio)})
                                                </div>
                                            </div>
                                            <div className="progress progress-compact" aria-hidden="true">
                                                <div className={`progress-bar ${cat.ratio >= 100 ? 'danger' : 'warning'}`} style={{ width: `${Math.min(cat.ratio, 100)}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>
                    )}

                    <section className="card" aria-labelledby="presupuestos-form-titulo">
                        <div className="card-header">
                            <h2 id="presupuestos-form-titulo">Presupuestos por categoría</h2>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSave} noValidate>
                                <div className="grid grid-2 gap-lg">
                                    {categories.map((cat) => {
                                        const id = `presupuesto-${cat.id}`;
                                        const ratio = comparison.categories.find(c => c.category === cat.name)?.ratio ?? 0;
                                        const hasBudget = amountValue(budgets[cat.name]) > 0;
                                        return (
                                            <div key={cat.id} className="budget-card">
                                                <Field label={cat.name} htmlFor={id} hint={`Gastado este mes: ${formatEuro(spentOf(cat.name))}`} error={errors[cat.name]}>
                                                    <AmountInput
                                                        id={id}
                                                        value={budgets[cat.name] ?? ''}
                                                        onChange={(value) => handleChange(cat.name, value)}
                                                        placeholder="Sin presupuesto"
                                                        aria-invalid={Boolean(errors[cat.name])}
                                                        aria-describedby={errors[cat.name] ? `${id}-error` : `${id}-ayuda`}
                                                    />
                                                </Field>
                                                {hasBudget && (
                                                    <div>
                                                        <div className="progress-zoned progress-compact" aria-hidden="true">
                                                            <div className={`progress-zoned-bar ${progressColor(ratio)}`} style={{ width: `${Math.min(ratio, 100)}%` }} />
                                                        </div>
                                                        <div className="text-sm text-muted mt-sm">{formatPct(ratio)} consumido</div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="impact-preview mt-lg">
                                    <h3 className="impact-preview-title">Impacto en tu ahorro</h3>
                                    <div className="impact-preview-row">
                                        <span>Ingresos del mes</span>
                                        <Money value={currentMonthIncome} />
                                    </div>
                                    <div className="impact-preview-row">
                                        <span>Presupuesto total</span>
                                        <Money value={totalBudget} />
                                    </div>
                                    <div className="impact-preview-row font-semibold">
                                        <span>Ahorro esperado</span>
                                        <Money value={expectedSavings} signed />
                                    </div>
                                </div>

                                <div className="form-actions mt-lg">
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Guardando…' : 'Guardar presupuestos'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
