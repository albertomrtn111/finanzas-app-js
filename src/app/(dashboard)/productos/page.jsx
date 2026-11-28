'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { latestByAccount } from '@/lib/financialSnapshots';
import { formatSignedPct } from '@/lib/moneyFormat';
import { jsonRequest, requestJson } from '@/lib/utils';
import { EmptyState, Field, LoadState, Money, useFeedback } from '@/components/ui';

const ASSET_TYPES = ['Fondo indexado', 'ETF', 'Acciones', 'Bonos', 'Criptomonedas', 'Plan de pensiones', 'Inmuebles', 'Otro'];

// Etiquetas según el peso en la cartera: núcleo (20 % o más) y satélite (menos del 5 %).
const productLabel = (weight) => {
    if (weight >= 20) return { label: 'Núcleo', className: 'core' };
    if (weight > 0 && weight < 5) return { label: 'Satélite', className: 'satellite' };
    return null;
};

export default function ProductosPage() {
    const { toast, confirm } = useFeedback();
    const [products, setProducts] = useState([]);
    const [investments, setInvestments] = useState([]);
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', asset_type: ASSET_TYPES[0] });
    const [nameError, setNameError] = useState('');

    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            const [productData, investmentData] = await Promise.all([requestJson('/api/investment-products'), requestJson('/api/investments')]);
            setProducts(Array.isArray(productData) ? productData : []);
            setInvestments(Array.isArray(investmentData) ? investmentData : []);
            setStatus({ loading: false, error: '' });
        } catch (error) {
            if (silent) toast({ type: 'error', text: `No se ha podido actualizar la lista: ${error.message}`, action: { label: 'Recargar', onClick: () => window.location.reload() } });
            else setStatus({ loading: false, error: error.message });
        }
    }, [toast]);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

    // Aportado, valor, rentabilidad y peso de cada producto
    const productStats = useMemo(() => {
        const latestRecords = latestByAccount(investments);
        const byAccount = new Map();
        for (const inv of investments) {
            const entry = byAccount.get(inv.account) || { contrib: 0, count: 0 };
            entry.contrib += Number(inv.contribution);
            entry.count += 1;
            byAccount.set(inv.account, entry);
        }
        const totalValue = Object.values(latestRecords).reduce((sum, inv) => sum + Number(inv.current_value), 0);

        const stats = {};
        for (const p of products) {
            const { contrib = 0, count = 0 } = byAccount.get(p.name) || {};
            const value = Number(latestRecords[p.name]?.current_value || 0);
            const gain = value - contrib;
            stats[p.name] = {
                invested: contrib,
                currentValue: value,
                returnPct: contrib !== 0 ? (gain / contrib) * 100 : 0,
                weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
                movements: count,
            };
        }
        return stats;
    }, [products, investments]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const name = form.name.trim();
        if (!name) {
            setNameError('Escribe el nombre del producto');
            document.getElementById('producto-nombre')?.focus();
            return;
        }

        setSaving(true);
        try {
            await requestJson('/api/investment-products', jsonRequest('POST', { ...form, name }));
            toast({ text: `Producto «${name}» añadido` });
            setForm({ name: '', asset_type: ASSET_TYPES[0] });
            await loadData({ silent: true });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (product) => {
        const movements = productStats[product.name]?.movements || 0;
        const ok = await confirm({
            title: 'Eliminar producto',
            text: movements
                ? `«${product.name}» tiene ${movements === 1 ? 'un movimiento registrado' : `${movements} movimientos registrados`}. Esos movimientos no se borran, pero ya no podrás registrar nuevos en este producto.`
                : `Se eliminará el producto «${product.name}».`,
            confirmLabel: movements ? 'Eliminar de todos modos' : 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            await requestJson(`/api/investment-products?id=${product.id}`, { method: 'DELETE' });
            setProducts(list => list.filter(p => p.id !== product.id));
            toast({ text: `Producto «${product.name}» eliminado` });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                <div className="page-header"><h1 className="page-title">Productos de inversión</h1></div>
                <LoadState loading={status.loading} error={status.error} onRetry={() => loadData()} label="Cargando tus productos…" />
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Productos de inversión</h1>
                <p className="page-subtitle">Gestiona tus productos de inversión: fondos, ETF, acciones…</p>
            </div>

            <div className="grid grid-2 gap-lg">
                <section className="card" aria-labelledby="productos-lista-titulo">
                    <div className="card-header"><h2 id="productos-lista-titulo">Productos actuales</h2></div>
                    <div className="card-body">
                        {products.length === 0 ? (
                            <EmptyState title="Todavía no hay productos" text="Añade el primero con el formulario." />
                        ) : (
                            <ul className="product-list">
                                {products.map((p) => {
                                    const stats = productStats[p.name];
                                    const label = stats ? productLabel(stats.weight) : null;
                                    return (
                                        <li key={p.id} className="product-card">
                                            <div className="product-card-header">
                                                <div className="product-card-title">
                                                    <span className="font-semibold">{p.name}</span>
                                                    {label && <span className={`product-label ${label.className}`}>{label.label}</span>}
                                                </div>
                                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(p)} aria-label={`Eliminar el producto ${p.name}`}>
                                                    Eliminar
                                                </button>
                                            </div>
                                            <div className="product-card-type">{p.asset_type}</div>

                                            {stats && stats.currentValue > 0 && (
                                                <dl className="product-card-stats">
                                                    <div>
                                                        <dt className="stat-label">Aportado</dt>
                                                        <dd className="stat-value"><Money value={stats.invested} /></dd>
                                                    </div>
                                                    <div>
                                                        <dt className="stat-label">Valor</dt>
                                                        <dd className="stat-value"><Money value={stats.currentValue} /></dd>
                                                    </div>
                                                    <div>
                                                        <dt className="stat-label">Rentabilidad</dt>
                                                        <dd className={`stat-value ${stats.returnPct >= 0 ? 'text-success' : 'text-danger'}`}>{formatSignedPct(stats.returnPct)}</dd>
                                                    </div>
                                                </dl>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>

                <section className="card" aria-labelledby="productos-nuevo-titulo">
                    <div className="card-header"><h2 id="productos-nuevo-titulo">Añadir producto</h2></div>
                    <div className="card-body">
                        <form onSubmit={handleSubmit} noValidate>
                            <Field label="Nombre del producto" htmlFor="producto-nombre" error={nameError}>
                                <input
                                    id="producto-nombre"
                                    type="text"
                                    className="form-input"
                                    placeholder="Por ejemplo, Vanguard Global Stock"
                                    maxLength={150}
                                    value={form.name}
                                    onChange={(e) => { setForm({ ...form, name: e.target.value }); setNameError(''); }}
                                    aria-invalid={Boolean(nameError)}
                                    aria-describedby={nameError ? 'producto-nombre-error' : undefined}
                                    required
                                />
                            </Field>
                            <Field label="Tipo de activo" htmlFor="producto-tipo">
                                <select
                                    id="producto-tipo"
                                    className="form-input form-select"
                                    value={form.asset_type}
                                    onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                                >
                                    {ASSET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </Field>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Añadiendo…' : 'Añadir producto'}
                                </button>
                            </div>
                        </form>

                        <div className="alert alert-info mt-lg">
                            <p className="font-semibold">Etiquetas según el peso en tu cartera</p>
                            <dl className="label-legend">
                                <div><dt><span className="product-label core">Núcleo</span></dt><dd>Productos que suponen un 20 % o más de tu cartera: la base de tu inversión.</dd></div>
                                <div><dt><span className="product-label satellite">Satélite</span></dt><dd>Productos que suponen menos de un 5 %: apuestas pequeñas que complementan el núcleo.</dd></div>
                            </dl>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
