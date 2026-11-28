'use client';

import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { formatEuro, formatPct } from '@/lib/moneyFormat';
import Measured from './Measured';
import TooltipBox from './TooltipBox';

function SliceTooltip({ active, payload }) {
    const slice = active && payload?.[0]?.payload;
    if (!slice) return null;
    const rows = [{ name: 'Importe', value: formatEuro(slice.value), color: slice.color }];
    if (slice.sharePct !== undefined && slice.sharePct !== null) rows.push({ name: 'Peso', value: formatPct(slice.sharePct) });
    return <TooltipBox title={slice.name} rows={rows} />;
}

// Donut con hueco para el total (lo pinta el servidor encima) y la leyenda en HTML debajo.
// data: [{ name, value, color, sharePct? }], ya ordenada y con colores fijos por posición.
export default function DonutChart({ data }) {
    return (
        <Measured render={({ width, height }) => {
            const outer = Math.max(48, Math.min(width, height) / 2 - 6);
            return (
                <PieChart width={width} height={height}>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={outer * 0.66}
                        outerRadius={outer}
                        stroke="var(--bg-primary)"
                        strokeWidth={2}
                        isAnimationActive={false}
                    >
                        {data.map(slice => <Cell key={slice.name} fill={slice.color} />)}
                    </Pie>
                    <Tooltip content={<SliceTooltip />} />
                </PieChart>
            );
        }} />
    );
}
