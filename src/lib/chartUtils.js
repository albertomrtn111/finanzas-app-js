
import { formatPercent } from './utils';

const RADIAN = Math.PI / 180;

/**
 * Render customized label for PieCharts
 * Shows percentage if > 5%
 */
export const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
    // Hide if less than 5% to avoid clutter
    if (percent < 0.05) return null;

    const radius = innerRadius + (outerRadius - innerRadius) * 0.5; // Center of slice
    // Push label out slightly if needed, or keep centered.
    // User requested: "Nombre 22%" or just "22%".
    // Let's position it slightly outside or centered depending on space. 
    // Standard centered is usually safer for simplistic usage.

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
                textShadow: '0px 1px 2px rgba(0,0,0,0.8)'
            }}
        >
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};
