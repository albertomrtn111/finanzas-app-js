'use client';

import { Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEuro } from '@/lib/moneyFormat';
import Measured from './Measured';
import TooltipBox from './TooltipBox';
import { formatAxisEuro, formatDate, formatMonthShort, formatMonthYear } from './format';
import { SERIES } from './palette';

function WealthTooltip({ active, payload }) {
    const point = active && payload?.[0]?.payload;
    if (!point) return null;
    return (
        <TooltipBox
            title={formatDate(point.date)}
            rows={[
                { name: 'Inversiones', value: formatEuro(point.invested), color: SERIES.investments },
                { name: 'Efectivo', value: formatEuro(point.cash), color: SERIES.cash },
                { name: 'Patrimonio', value: formatEuro(point.total), total: true },
            ]}
        />
    );
}

function InvestmentTooltip({ active, payload }) {
    const point = active && payload?.[0]?.payload;
    if (!point) return null;
    const gain = point.value - point.contributed;
    return (
        <TooltipBox
            title={formatDate(point.date)}
            rows={[
                { name: 'Valor', value: formatEuro(point.value), color: SERIES.value },
                { name: 'Capital aportado', value: formatEuro(point.contributed), color: SERIES.contributed },
                { name: gain >= 0 ? 'Plusvalía' : 'Minusvalía', value: formatEuro(gain), total: true },
            ]}
        />
    );
}

const axisProps = { tick: { fontSize: 12 }, tickLine: false };

// Evolución mensual (un punto por fin de mes y el último, hoy).
// variant="patrimonio": área apilada de inversiones + efectivo; data: [{ month, date, invested, cash, total }].
// variant="inversiones": valor frente a capital aportado; data: [{ month, date, value, contributed }].
export default function EvolutionChart({ variant, data }) {
    const spansYears = data.length > 0 && data[0].month.slice(0, 4) !== data.at(-1).month.slice(0, 4);
    const tickFormatter = spansYears ? formatMonthYear : formatMonthShort;
    return (
        <Measured render={({ width, height, isMobile }) => {
            const common = { width, height, data, margin: { top: 8, right: 12, left: 0, bottom: 0 }, accessibilityLayer: true };
            const xAxis = (
                <XAxis
                    dataKey="month"
                    tickFormatter={tickFormatter}
                    {...axisProps}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    interval="preserveStartEnd"
                    minTickGap={spansYears ? 24 : 12}
                />
            );
            const yAxis = <YAxis tickFormatter={formatAxisEuro} {...axisProps} axisLine={false} width={isMobile ? 64 : 76} />;
            const grid = <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 3" />;
            const cursor = { stroke: 'var(--text-tertiary)', strokeDasharray: '3 3' };

            if (variant === 'inversiones') {
                return (
                    <LineChart {...common}>
                        {grid}{xAxis}{yAxis}
                        <Tooltip content={<InvestmentTooltip />} cursor={cursor} />
                        <Line type="monotone" dataKey="contributed" name="Capital aportado" stroke={SERIES.contributed} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="value" name="Valor" stroke={SERIES.value} strokeWidth={2.5} dot={data.length <= 2 ? { r: 4 } : false} isAnimationActive={false} />
                    </LineChart>
                );
            }
            return (
                <AreaChart {...common}>
                    {grid}{xAxis}{yAxis}
                    <Tooltip content={<WealthTooltip />} cursor={cursor} />
                    <Area type="monotone" dataKey="invested" name="Inversiones" stackId="patrimonio" stroke={SERIES.investments} fill={SERIES.investments} fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
                    <Area type="monotone" dataKey="cash" name="Efectivo" stackId="patrimonio" stroke={SERIES.cash} fill={SERIES.cash} fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
            );
        }} />
    );
}
