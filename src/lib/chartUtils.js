import { formatPercent as formatPercentBase, formatCurrency } from './utils';

const RADIAN = Math.PI / 180;

// Re-export formatCurrency for convenience in charts
export { formatCurrency };

/**
 * Calcula el porcentaje de un valor sobre el total
 */
export const calcPercent = (value, total) => {
    if (!total || total === 0) return 0;
    return (value / total) * 100;
};

/**
 * Formatea un porcentaje
 * Wrapper sobre la utilidad base para controlar decimales por defecto
 */
export const formatPercent = (value, decimals = 1) => {
    return formatPercentBase(value, decimals);
};

/**
 * Render customized label for PieCharts
 * Shows percentage if > 5%
 */
export const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
    // Hide if less than 5% to avoid clutter
    if (percent < 0.05) return null;

    const radius = innerRadius + (outerRadius - innerRadius) * 0.5; // Center of slice

    // Position calculation
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text
            x={x}
            y={y}
            fill="white"
            textAnchor="middle"
            dominantBaseline="central"
            style={{
                fontSize: '11px',
                fontWeight: 600,
                textShadow: '0px 1px 2px rgba(0,0,0,0.8)',
                pointerEvents: 'none'
            }}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};
