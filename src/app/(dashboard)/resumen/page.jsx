import Link from 'next/link';
import ChartFrame from '@/components/charts/ChartFrame';
import ChartLegend from '@/components/charts/ChartLegend';
import { LazyDonutChart, LazySavingsChart } from '@/components/charts/lazy';
import chartStyles from '@/components/charts/charts.module.css';
import { VisuallyHidden } from '@/components/ui/States';
import { loadResumen, requireUserId, todayInSpain } from '@/lib/pageData';
import { parseResumenPeriod } from '@/lib/resumenView';
import { formatEuro, formatPct, formatSignedEuro, formatSignedPct } from '@/lib/moneyFormat';
import PeriodControls from './PeriodControls';
import styles from './resumen.module.css';

const NEUTRAL_BADGE = { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' };

const progressColor = ratio => (ratio > 90 ? 'red' : ratio > 70 ? 'yellow' : 'green');

// Variación frente al tramo equivalente. La flecha dice si sube o baja; el color, si es bueno o malo
// para esa cifra (más ingresos o ahorro es bueno; más gasto es malo).
function Trend({ value, goodWhenUp, label, format, previousEmpty }) {
    if (value === null || value === undefined) {
        if (!previousEmpty) return null;
        return <div className="kpi-trend"><span className={styles.trendText}>Sin datos en {label}</span></div>;
    }
    if (value === 0) return <div className="kpi-trend"><span className={styles.trendText}>Igual que en {label}</span></div>;
    const up = value > 0;
    const good = up === goodWhenUp;
    return (
        <div className="kpi-trend">
            <span className={good ? styles.trendGood : styles.trendBad}>
                <span aria-hidden="true">{up ? '▲' : '▼'}</span> {format(value)} frente a {label}
                <VisuallyHidden> ({good ? 'mejor' : 'peor'} que el periodo anterior)</VisuallyHidden>
            </span>
        </div>
    );
}

function Donut({ title, slices, total, label }) {
    return (
        <ChartFrame
            title={title}
            heightMobile={220}
            heightDesktop={220}
            overlay={(
                <div className={chartStyles.center}>
                    <span className={chartStyles.centerLabel}>{label}</span>
                    <span className={chartStyles.centerValue}>{formatEuro(total)}</span>
                </div>
            )}
            legend={<ChartLegend items={slices} label={`Leyenda: ${title}`} />}
        >
            <LazyDonutChart data={slices} />
        </ChartFrame>
    );
}

// Resumen personal de un mes o un año. Server Component: el periodo sale de la URL y la página llega
// ya con las cifras; solo el selector de periodo y los gráficos son islas de cliente.
export default async function ResumenPage({ searchParams }) {
    const userId = await requireUserId();
    const today = todayInSpain();
    const period = parseResumenPeriod(await searchParams, today);
    const view = await loadResumen(userId, period, today);
    const { totals, budget, comparison, status, charts } = view;
    const isYear = period.view === 'year';
    const prevEmpty = comparison.previousEmpty && view.hasData;
    const hasMonthly = charts.monthly.some(m => m.income !== 0 || m.expenses !== 0);

    return (
        <div className="page-container">
            <div className="responsive-header">
                <div>
                    <h1 className="status-header-title" style={{ margin: 0 }}>Estado financiero · {view.label}</h1>
                    <div className="status-header-subtitle">{status.desc}</div>
                </div>
                <div className="header-controls">
                    <div className={`status-badge ${status.level === 'neutral' ? '' : status.level}`} style={status.level === 'neutral' ? NEUTRAL_BADGE : undefined}>
                        <span className="status-badge-icon" style={status.level === 'neutral' ? { background: 'var(--text-muted)' } : undefined}></span>
                        {status.label}
                    </div>
                    <PeriodControls period={period} years={view.years} today={today} isCurrentMonth={view.isCurrentMonth} />
                </div>
            </div>

            {!view.hasData && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <p className="text-muted" style={{ margin: 0 }}>
                            No hay ingresos ni gastos en {view.label}. <Link href="/registro">Registrar movimientos</Link>
                        </p>
                    </div>
                </div>
            )}

            <div className="kpi-grid">
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ingresos</div>
                    <div className="kpi-main"><div className="kpi-value">{formatEuro(totals.income)}</div></div>
                    <Trend value={comparison.incomePct} goodWhenUp label={comparison.label} format={formatSignedPct} previousEmpty={prevEmpty} />
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Gastos</div>
                    <div className="kpi-main"><div className="kpi-value">{formatEuro(totals.expenses)}</div></div>
                    <Trend value={comparison.expensesPct} goodWhenUp={false} label={comparison.label} format={formatSignedPct} previousEmpty={prevEmpty} />
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${totals.savings >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>{formatEuro(totals.savings)}</div>
                    </div>
                    <Trend value={comparison.savings} goodWhenUp label={comparison.label} format={formatSignedEuro} previousEmpty={prevEmpty} />
                </div>
                <div className="kpi-card-enhanced">
                    <div className="kpi-label">Tasa de ahorro</div>
                    <div className="kpi-main">
                        <div className={`kpi-value ${totals.savingsRate === null ? '' : totals.savingsRate >= 0 ? 'kpi-positive' : 'kpi-negative'}`}>
                            {totals.savingsRate === null ? '—' : formatPct(totals.savingsRate)}
                        </div>
                    </div>
                    <div className="kpi-trend">
                        <span className={styles.trendText}>{totals.savingsRate === null ? 'Sin ingresos en el periodo' : `Objetivo: ${formatPct(20)}`}</span>
                    </div>
                </div>
            </div>

            {view.hasData && <p className={chartStyles.note}>{comparison.description}</p>}

            {budget.total > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">
                            Presupuesto {isYear ? 'anual' : 'mensual'}
                            {isYear && budget.months < 12 && (
                                <span className="text-muted text-sm" style={{ fontWeight: 400 }}> · {budget.months} {budget.months === 1 ? 'mes transcurrido' : 'meses transcurridos'}</span>
                            )}
                        </h3>
                        <div className="grid grid-3 gap-md mb-md">
                            <div>
                                <div className="text-muted text-sm">Presupuestado</div>
                                <div className="font-semibold">{formatEuro(budget.total)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Gastado en categorías con presupuesto</div>
                                <div className="font-semibold">{formatEuro(budget.spent)}</div>
                            </div>
                            <div>
                                <div className="text-muted text-sm">Disponible</div>
                                <div className={`font-semibold ${budget.remaining >= 0 ? 'text-success' : 'text-danger'}`}>{formatEuro(budget.remaining)}</div>
                            </div>
                        </div>
                        <div className="progress-zoned" role="img" aria-label={`Consumido el ${formatPct(budget.ratio)} del presupuesto`}>
                            <div className={`progress-zoned-bar ${progressColor(budget.ratio)}`} style={{ width: `${Math.min(budget.ratio, 100)}%` }} />
                        </div>
                        {budget.unbudgetedSpent !== 0 && (
                            <div className="text-muted text-sm" style={{ marginTop: 'var(--spacing-sm)' }}>
                                Gasto sin presupuesto: {formatEuro(budget.unbudgetedSpent)}
                                {budget.unbudgetedCategories.length > 0 && ` (${budget.unbudgetedCategories.join(', ')})`}. No cuenta como exceso.
                            </div>
                        )}
                        {budget.projected !== null && (
                            <div className="projection-text">
                                📈 Si mantienes este ritmo, el gasto en categorías con presupuesto cerrará el mes en {formatEuro(budget.projected)}
                                {budget.projected > budget.total && <span className="text-danger"> (superarás el presupuesto)</span>}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
                            {budget.categories.map(cat => (
                                <div key={cat.category}>
                                    <div className="flex-between text-sm">
                                        <span>{cat.category}</span>
                                        <span className={cat.over ? 'text-danger' : 'text-muted'}>
                                            {formatEuro(cat.spent)} de {formatEuro(cat.budget)} ({formatPct(cat.ratio ?? 0)})
                                        </span>
                                    </div>
                                    <div className="progress-zoned" style={{ height: '6px', marginTop: '4px' }}>
                                        <div className={`progress-zoned-bar ${progressColor(cat.ratio ?? 0)}`} style={{ width: `${Math.min(cat.ratio ?? 0, 100)}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {view.alerts.length > 0 && (
                <div className="card mb-lg">
                    <div className="card-body">
                        <h3 className="section-title">💡 Avisos</h3>
                        <div className="smart-alerts">
                            {view.alerts.map(alert => (
                                <div key={alert.title} className={`smart-alert ${alert.type}`}>
                                    <span className="smart-alert-icon" aria-hidden="true">{alert.icon}</span>
                                    <div className="smart-alert-content">
                                        <div className="smart-alert-title">{alert.title}</div>
                                        <div className="smart-alert-desc">{alert.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {hasMonthly && (
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <ChartFrame
                        title={`Ahorro de cada mes (${period.year})`}
                        subtitle="Ingresos menos gastos. Pasa el dedo o el ratón por una barra para ver el detalle."
                        heightMobile={240}
                        heightDesktop={260}
                        legend={<ChartLegend inline items={[{ name: 'Ahorro', color: 'var(--success)' }, { name: 'Déficit (gastas más de lo que ingresas)', color: 'var(--danger)' }]} />}
                    >
                        <LazySavingsChart data={charts.monthly} />
                    </ChartFrame>
                </div>
            )}

            {(charts.categories.length > 0 || charts.types.length > 0) && (
                <div className={chartStyles.grid}>
                    {charts.categories.length > 0 && <Donut title="Gastos por categoría" slices={charts.categories} total={totals.expenses} label="Gasto total" />}
                    {charts.types.length > 0 && <Donut title="Gasto fijo y variable" slices={charts.types} total={totals.expenses} label="Gasto total" />}
                </div>
            )}
        </div>
    );
}
