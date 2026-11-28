import TooltipBox from './TooltipBox';
import { formatPct } from '@/lib/moneyFormat';

// Tooltip genérico para Recharts, legible en claro y en oscuro (lo usa Inicio).
// formatter(value, name, entry) da el texto de cada valor; totalValue añade el porcentaje sobre ese total.
const CustomTooltip = ({ active, payload, label, formatter, totalValue }) => {
    if (!active || !payload || payload.length === 0) return null;
    const rows = payload.map((entry, index) => {
        const value = formatter ? formatter(entry.value, entry.name, entry)
            : (typeof entry.value === 'number' ? entry.value.toLocaleString('es-ES') : entry.value);
        const share = totalValue && typeof entry.value === 'number' && totalValue > 0 ? ` (${formatPct((entry.value / totalValue) * 100)})` : '';
        return { name: entry.name ?? `Serie ${index + 1}`, value: `${value}${share}`, color: entry.color || entry.fill || entry.payload?.fill };
    });
    return <TooltipBox title={label} rows={rows} />;
};

export default CustomTooltip;
