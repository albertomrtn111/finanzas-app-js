'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { euro, PageHeader, StatCard, LoadState, EmptyState, useBusinessData } from '@/components/business/ui';

export default function BusinessSummaryPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['summary']);
    const summary = data.summary;
    const base = `/empresa/${businessId}`;
    return <div className="page-container business-page">
        <PageHeader title={summary?.business?.name || 'Empresa'} subtitle="Resultado, caja y próximos compromisos en un mismo lugar"><Link className="btn btn-primary" href={`${base}/operaciones`}>Registrar operación</Link></PageHeader>
        <LoadState loading={loading} error={error} retry={refresh} />
        {summary && <>
            <div className="business-kpi-grid">
                <StatCard label="Líquido hoy" value={euro(summary.liquid)} help="Saldos de banco y caja" />
                <StatCard label="Resultado de gestión · mes" value={euro(summary.accrued.result)} help={`${euro(summary.accrued.income)} ingresado · ${euro(summary.accrued.expense)} gastado`} />
                <StatCard label="Flujo de caja · mes" value={euro(summary.monthFlow)} help="Entradas menos salidas reales" />
                <StatCard label="Previsión a 30 días" value={euro(summary.projected30)} help="Incluye pendientes y planes" />
            </div>
            <div className="grid grid-2 gap-lg business-section-grid">
                <div className="card"><div className="card-header"><h2>Por cobrar y pagar</h2></div><div className="card-body business-list">
                    <div className="business-line"><span>Por cobrar</span><strong>{euro(summary.pending.income)}</strong></div>
                    <div className="business-line"><span>Por pagar</span><strong>{euro(summary.pending.expense)}</strong></div>
                    <div className="business-line"><span>Vencido</span><strong>{euro(summary.pending.overdue)}</strong></div>
                    <Link href={`${base}/pendientes`}>Ver vencimientos →</Link>
                </div></div>
                <div className="card"><div className="card-header"><h2>IVA · {summary.vat.period}</h2></div><div className="card-body business-list">
                    <div className="business-line"><span>Repercutido</span><strong>{euro(summary.vat.output)}</strong></div>
                    <div className="business-line"><span>Deducible registrado</span><strong>{euro(summary.vat.deductible)}</strong></div>
                    <div className="business-line"><span>Diferencia orientativa</span><strong>{euro(summary.vat.difference)}</strong></div>
                    <Link href={`${base}/iva`}>Revisar IVA →</Link>
                </div></div>
            </div>
            <div className="card business-spaced"><div className="card-header"><h2>Cuentas de la empresa</h2></div><div className="card-body">
                {summary.accountBalances.length ? <div className="business-account-grid">{summary.accountBalances.map(account => <Link key={account.id} className="business-account-tile" href={`${base}/movimientos?accountId=${account.id}`}><span>{account.name}</span><strong>{euro(account.balance)}</strong></Link>)}</div> : <EmptyState text="Añade una cuenta bancaria o caja para empezar a controlar el líquido." />}
                <Link href={`${base}/cuentas`}>Gestionar cuentas →</Link>
            </div></div>
        </>}
    </div>;
}
