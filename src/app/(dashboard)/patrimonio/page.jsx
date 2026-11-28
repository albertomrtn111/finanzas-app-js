import Link from 'next/link';
import BarList from '@/components/charts/BarList';
import Change from '@/components/charts/Change';
import ChartFrame from '@/components/charts/ChartFrame';
import ChartLegend from '@/components/charts/ChartLegend';
import PeriodTabs from '@/components/charts/PeriodTabs';
import { LazyDonutChart, LazyEvolutionChart } from '@/components/charts/lazy';
import { SERIES } from '@/components/charts/palette';
import styles from '@/components/charts/charts.module.css';
import { EmptyState } from '@/components/ui/States';
import { formatDate } from '@/lib/dateFormat';
import { formatEuro, formatPct, formatSignedPct } from '@/lib/moneyFormat';
import { loadPatrimonio, requireUserId, todayInSpain } from '@/lib/pageData';
import { WINDOW_OPTIONS, parseWindow } from '@/lib/wealth';

const TYPE_COLOR = { 'Inversión': SERIES.investments, Efectivo: SERIES.cash };

function windowHref(value) {
    return value === '12' ? '/patrimonio' : `/patrimonio?meses=${value}`;
}

// Patrimonio: efectivo e inversiones a hoy y su evolución. Server Component; la ventana de la
// evolución va en la URL (?meses=12 | 36 | todo) y solo los gráficos se cargan en el navegador.
export default async function PatrimonioPage({ searchParams }) {
    const userId = await requireUserId();
    const today = todayInSpain();
    const range = parseWindow((await searchParams).meses);
    const view = await loadPatrimonio(userId, { months: range.months, today });

    const header = (
        <div className="page-header">
            <h1 className="page-title">Patrimonio</h1>
            <p className="page-subtitle">Inversiones y efectivo a {formatDate(today)}</p>
        </div>
    );

    if (!view.hasData) {
        return (
            <div className="page-container">
                {header}
                <div className="card">
                    <EmptyState
                        title="Aún no hay inversiones ni saldos"
                        text="Añade el valor de tus inversiones o el saldo de tus cuentas para ver tu patrimonio."
                        action={(
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <Link href="/inversiones/registro" className="btn btn-primary">Añadir inversión</Link>
                                <Link href="/efectivo" className="btn btn-secondary">Añadir efectivo</Link>
                            </div>
                        )}
                    />
                </div>
            </div>
        );
    }

    const year = today.slice(0, 4);
    const cashAccounts = view.accounts.filter(a => a.type === 'Efectivo').length;
    const distribution = view.distribution.filter(d => d.value > 0).map(d => ({
        ...d,
        color: d.name === 'Inversiones' ? SERIES.investments : SERIES.cash,
        sharePct: view.total > 0 ? Math.round((d.value / view.total) * 1000) / 10 : null,
    }));
    const tabs = WINDOW_OPTIONS.map(option => ({ href: windowHref(option.value), label: option.label, active: option.value === range.value }));

    return (
        <div className="page-container">
            {header}

            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Patrimonio total</div>
                    <div className="kpi-value">{formatEuro(view.total)}</div>
                    {view.sinceStart && (
                        <div className={styles.kpiSub}>
                            <Change value={view.sinceStart.change} pct={view.sinceStart.changePct} suffix={`desde el ${formatDate(view.sinceStart.date)}`} />
                        </div>
                    )}
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Inversiones</div>
                    <div className="kpi-value">{formatEuro(view.invested)}</div>
                    <div className={styles.kpiSub}>
                        Plusvalía: <Change value={view.gain} pct={view.returnPct} />
                    </div>
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Efectivo</div>
                    <div className="kpi-value">{formatEuro(view.cash)}</div>
                    <div className={styles.kpiSub}>{cashAccounts === 1 ? 'Una cuenta' : `${cashAccounts} cuentas`}</div>
                </div>
                {view.yearChange && (
                    <div className="kpi-card-enhanced">
                        <div className="kpi-label">Variación en {year}</div>
                        <div className={`kpi-value ${view.yearChange.change >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {view.yearChange.changePct === null ? '—' : formatSignedPct(view.yearChange.changePct)}
                        </div>
                        <div className={styles.kpiSub}>
                            <Change value={view.yearChange.change} suffix={`desde el ${formatDate(view.yearChange.date)}`} />
                        </div>
                    </div>
                )}
            </div>

            <p className={styles.note}>
                {view.investedSharePct !== null && <>💡 El {formatPct(view.investedSharePct, 0)} de tu patrimonio está invertido. </>}
                Las variaciones del patrimonio incluyen lo que ahorras y aportas: no son rentabilidad.
                {view.futureRecords > 0 && ` Hay ${view.futureRecords} ${view.futureRecords === 1 ? 'registro' : 'registros'} con fecha futura que aún no cuentan.`}
            </p>

            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <ChartFrame
                    title="Evolución del patrimonio"
                    subtitle="Valor a fin de cada mes; el último punto es hoy."
                    actions={<PeriodTabs label="Periodo de la evolución" options={tabs} />}
                    heightMobile={240}
                    heightDesktop={280}
                    legend={<ChartLegend inline items={[{ name: 'Inversiones', color: SERIES.investments }, { name: 'Efectivo', color: SERIES.cash }]} />}
                >
                    {view.series.length > 1
                        ? <LazyEvolutionChart variant="patrimonio" data={view.series} />
                        : <div className={styles.empty}>Con datos de un solo mes aún no hay evolución que mostrar.</div>}
                </ChartFrame>
            </div>

            <div className={styles.grid}>
                <ChartFrame
                    title="Distribución del patrimonio"
                    heightMobile={220}
                    heightDesktop={220}
                    overlay={(
                        <div className={styles.center}>
                            <span className={styles.centerLabel}>Total</span>
                            <span className={styles.centerValue}>{formatEuro(view.total)}</span>
                        </div>
                    )}
                    legend={<ChartLegend items={distribution} label="Leyenda: distribución del patrimonio" />}
                >
                    {distribution.length > 0
                        ? <LazyDonutChart data={distribution} />
                        : <div className={styles.empty}>Todos los saldos y valores están a cero.</div>}
                </ChartFrame>

                <ChartFrame
                    title="Valor por cuenta"
                    boxHeight={false}
                    legend={<ChartLegend inline items={[{ name: 'Inversión', color: SERIES.investments }, { name: 'Efectivo', color: SERIES.cash }]} />}
                >
                    <BarList items={view.accounts.map(a => ({ key: `${a.type}-${a.account}`, label: a.account, value: a.value, color: TYPE_COLOR[a.type] }))} />
                </ChartFrame>
            </div>

            <div className="card mt-lg">
                <div className="card-header"><h3>Detalle por cuenta</h3></div>
                <div className="card-body">
                    <div className="table-container">
                        <table className="table data-table">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Cuenta</th>
                                    <th style={{ textAlign: 'right' }}>Valor</th>
                                    <th style={{ textAlign: 'right' }}>Rentabilidad</th>
                                    <th style={{ textAlign: 'right' }}>Peso</th>
                                    <th>Último dato</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.accounts.map(acc => (
                                    <tr key={`${acc.type}-${acc.account}`}>
                                        <td><span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{acc.type}</span></td>
                                        <td className="font-semibold">{acc.account}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatEuro(acc.value)}</td>
                                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {acc.type === 'Inversión' && acc.returnPct !== null
                                                ? <span className={acc.returnPct >= 0 ? styles.good : styles.bad}>{formatSignedPct(acc.returnPct)}</span>
                                                : <span className="text-muted">—</span>}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>{acc.weightPct === null ? '—' : formatPct(acc.weightPct, 0)}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(acc.date)}</td>
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
