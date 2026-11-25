import TooltipBox from './TooltipBox';
import { formatEuro, formatPct } from '@/lib/moneyFormat';

// Tooltip de una porción de un PieChart, legible en claro y en oscuro (lo usa Inicio).
const PieTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0];
    const percent = data.percent ?? data.payload?.percent;
    const rows = [{ name: 'Importe', value: formatEuro(data.value), color: data.payload?.fill || data.color }];
    if (percent !== undefined) rows.push({ name: 'Peso', value: formatPct(percent * 100) });
    return <TooltipBox title={data.name} rows={rows} />;
};

export default PieTooltip;
