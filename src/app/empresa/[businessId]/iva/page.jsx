'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { euro, shortDate, PageHeader, StatCard, LoadState, EmptyState, useBusinessData } from '@/components/business/ui';

function currentQuarter() { const now = new Date(); return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`; }

export default function VatPage() {
    const { businessId } = useParams();
    const { data, loading, error, refresh } = useBusinessData(businessId, ['activities']);
    const [period, setPeriod] = useState(currentQuarter);
    const periods = useMemo(() => [...new Set([currentQuarter(), ...(data.activities || []).map(a => a.vat_period).filter(Boolean)])].sort().reverse(), [data.activities]);
    const rows = useMemo(() => (data.activities || []).filter(a => a.vat_period === period && a.document_kind !== 'NONE'), [data.activities, period]);
    const output = rows.filter(a => a.direction === 'INCOME').reduce((sum, a) => sum + Number(a.vat_amount), 0);
    const input = rows.filter(a => a.direction === 'EXPENSE').reduce((sum, a) => sum + Number(a.deductible_vat), 0);
    return <div className="page-container business-page">
        <PageHeader title="IVA" subtitle="Revisa facturas y cuotas registradas antes de preparar tu declaración"><a className="btn btn-secondary" href={`/api/businesses/${businessId}/vat-export?period=${period}`}>Exportar detalle CSV</a></PageHeader>
        <div className="business-section-head"><label className="form-label" htmlFor="vatPeriodSelect">Período</label><select id="vatPeriodSelect" className="form-input form-select business-filter" value={period} onChange={e => setPeriod(e.target.value)}>{periods.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <LoadState loading={loading} error={error} retry={refresh} />
        {!loading && !error && <><div className="business-kpi-grid"><StatCard label="IVA repercutido" value={euro(output)} /><StatCard label="IVA deducible registrado" value={euro(input)} /><StatCard label="Diferencia orientativa" value={euro(output - input)} help="Revisa ajustes y regímenes aplicables" /><StatCard label="Facturas en el período" value={rows.length} /></div>
            <p className="business-helper">El IVA se calcula con las facturas registradas en este período. Los gastos sin factura no suman IVA deducible. Este resumen no presenta el modelo 303.</p>
            <div className="card business-spaced"><div className="card-header"><h2>Detalle de facturas</h2></div><div className="card-body">{rows.length ? <div className="business-list">{rows.map(item => <div key={item.id} className="business-line business-upcoming"><div><strong>{item.document_number} · {item.counterparty_name}</strong><small>{item.direction === 'INCOME' ? 'Emitida' : 'Recibida'} · {shortDate(item.document_date)} · {item.description}</small></div><div><strong>{euro(item.vat_amount)}</strong><small>{item.direction === 'EXPENSE' ? `Deducible ${euro(item.deductible_vat)}` : `Base ${euro(item.base_amount)}`}</small></div></div>)}</div> : <EmptyState text="No hay facturas registradas en este período." />}</div></div>
        </>}
    </div>;
}
