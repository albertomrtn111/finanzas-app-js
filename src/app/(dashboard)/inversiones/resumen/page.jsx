import Link from 'next/link';
import BarList from '@/components/charts/BarList';
import ChartFrame from '@/components/charts/ChartFrame';
import ChartLegend from '@/components/charts/ChartLegend';
import PeriodTabs from '@/components/charts/PeriodTabs';
import { LazyDonutChart, LazyEvolutionChart } from '@/components/charts/lazy';
import { SERIES } from '@/components/charts/palette';
import styles from '@/components/charts/charts.module.css';
import { EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/dateFormat';
import { formatEuro, formatPct, formatSignedPct } from '@/lib/moneyFormat';
import { loadInversiones, requireUserId, todayInSpain } from '@/lib/pageData';
import { toSlices } from '@/lib/resumenView';
import { WINDOW_OPTIONS, parseWindow } from '@/lib/wealth';

function windowHref(value) {
    return value === '12' ? '/inversiones/resumen' : `/inversiones/resumen?meses=${value}`;
}

// Resumen de la cartera. Server Component; la ventana de la evolución va en la URL (?meses=…).
// Capital aportado = suma de las aportaciones registradas menos las retiradas (cada registro guarda lo
// aportado en ese momento, no un acumulado). Plusvalía = valor actual − capital aportado.
export default async function InversionesResumenPage({ searchParams }) {
    const userId = await requireUserId();
    const today = todayInSpain();
    const range = parseWindow((await searchParams).meses);
    const view = await loadInversiones(userId, { months: range.months, today });

    const header = (
        <div className="page-header">
            <h1 className="page-title">Resumen de inversiones</h1>
            <p className="page-subtitle">Tu cartera a {formatDate(today)}</p>
        </div>
    );

    if (!view.hasData) {
        return (
            <div className="page-container">
                {header}
                <div className="card">
                    <EmptyState
                        title="Aún no hay inversiones"
                        text="Registra una aportación o el valor de un producto para ver aquí tu cartera."
                        action={<Link href="/inversiones/registro" className="btn btn-primary">Registrar inversión</Link>}
                    />
                </div>
            </div>
        );
    }

    const assetSlices = toSlices(view.byAssetType, 'Otros');
    const openProducts = view.products.filter(p => !p.closed);
    const tabs = WINDOW_OPTIONS.map(option => ({ href: windowHref(option.value), label: option.label, active: option.value === range.value }));

    return (
        <div className="page-container">
            {header}

            {view.health && (
                <div className="status-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div>
                        <div className="status-header-title">Salud de la cartera</div>
                        <div className="status-header-subtitle">Diversificación y concentración de las posiciones abiertas</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div className={`health-indicator ${view.health.diversification.level}`} title={view.health.diversification.desc}>
                            Diversificación: {view.health.diversification.label} · {view.health.diversification.desc}
                        </div>
                        <div className={`health-indicator ${view.health.concentration.level}`} title={view.health.concentration.desc}>
                            Concentración: {view.health.concentration.label} · {view.health.concentration.desc}
                        </div>
                    </div>
                </div>
            )}

            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Capital aportado</div>
                    <div className="kpi-value">{formatEuro(view.contributed)}</div>
                    <div className={styles.kpiSub}>Aportaciones menos retiradas</div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Valor actual</div>
                    <div className="kpi-value">{formatEuro(view.value)}</div>
                    <div className={styles.kpiSub}>Último valor de cada producto</div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">{view.gain >= 0 ? 'Plusvalía' : 'Minusvalía'}</div>
                    <div className={`kpi-value ${view.gain >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>{formatEuro(view.gain)}</div>
                    <div className={styles.kpiSub}>
                        Rentabilidad: {view.returnPct === null ? '—' : <span className={view.returnPct >= 0 ? styles.good : styles.bad}>{formatSignedPct(view.returnPct)}</span>}
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Posiciones abiertas</div>
                    <div className="kpi-value">{view.positions}</div>
                    {view.productCount > view.positions && (
                        <div className={styles.kpiSub}>{view.productCount - view.positions} cerradas (valor 0 €)</div>
                    )}
                </div>
            </div>

            <p className={styles.note}>
                Plusvalía = valor actual − capital aportado. Incluye lo ganado en posiciones ya cerradas.
                {view.futureRecords > 0 && ` Hay ${view.futureRecords} ${view.futureRecords === 1 ? 'registro' : 'registros'} con fecha futura que aún no cuentan.`}
            </p>

            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <ChartFrame
                    title="Valor frente a capital aportado"
                    subtitle="A fin de cada mes; el último punto es hoy. La distancia entre las dos líneas es la plusvalía."
                    actions={<PeriodTabs label="Periodo de la evolución" options={tabs} />}
                    heightMobile={240}
                    heightDesktop={280}
                    legend={<ChartLegend inline items={[{ name: 'Valor', color: SERIES.value, shape: 'line' }, { name: 'Capital aportado', color: SERIES.contributed, shape: 'dashed' }]} />}
                >
                    {view.series.length > 1
                        ? <LazyEvolutionChart variant="inversiones" data={view.series} />
                        : <div className={styles.empty}>Con datos de un solo mes aún no hay evolución que mostrar.</div>}
                </ChartFrame>
            </div>

            <div className={styles.grid}>
                <ChartFrame
                    title="Por tipo de activo"
                    heightMobile={220}
                    heightDesktop={220}
                    overlay={(
                        <div className={styles.center}>
                            <span className={styles.centerLabel}>Valor</span>
                            <span className={styles.centerValue}>{formatEuro(view.value)}</span>
                        </div>
                    )}
                    legend={<ChartLegend items={assetSlices} label="Leyenda: por tipo de activo" />}
                >
                    {assetSlices.length > 0
                        ? <LazyDonutChart data={assetSlices} />
                        : <div className={styles.empty}>Todas las posiciones están cerradas.</div>}
                </ChartFrame>

                <ChartFrame title="Por producto" boxHeight={false}>
                    {openProducts.length > 0
                        ? <BarList items={openProducts.map(p => ({ key: p.account, label: p.account, value: p.value, color: SERIES.value, meta: p.weightPct === null ? null : formatPct(p.weightPct, 0) }))} />
                        : <p className="text-muted">Todas las posiciones están cerradas.</p>}
                </ChartFrame>
            </div>

            <div className="card">
                <div className="card-header"><h3>Detalle por producto</h3></div>
                <div className="card-body">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Tipo</th>
                                    <th style={{ textAlign: 'right' }}>Peso</th>
                                    <th style={{ textAlign: 'right' }}>Capital aportado</th>
                                    <th style={{ textAlign: 'right' }}>Valor actual</th>
                                    <th style={{ textAlign: 'right' }}>Plusvalía</th>
                                    <th style={{ textAlign: 'right' }}>Rentabilidad</th>
                                    <th>Último dato</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.products.map(p => (
                                    <tr key={p.account}>
                                        <td className="font-semibold">{p.account}{p.closed && <span className="text-muted"> (cerrada)</span>}</td>
                                        <td><span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{p.assetType}</span></td>
                                        <td style={{ textAlign: 'right' }}>{p.weightPct === null ? '—' : formatPct(p.weightPct)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatEuro(p.contributed)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatEuro(p.value)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className={p.gain >= 0 ? styles.good : styles.bad}>{formatEuro(p.gain)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {p.returnPct === null ? <span className="text-muted">—</span> : <span className={p.returnPct >= 0 ? styles.good : styles.bad}>{formatSignedPct(p.returnPct)}</span>}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.date)}</td>
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
