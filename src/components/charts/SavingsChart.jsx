'use client';

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEuro, formatSignedEuro } from '@/lib/moneyFormat';
import Measured from './Measured';
import TooltipBox from './TooltipBox';
import { formatAxisEuro, formatMonthLong, formatMonthShort } from './format';
import { BAD, GOOD } from './palette';

function SavingsTooltip({ active, payload }) {
    const point = active && payload?.[0]?.payload;
    if (!point) return null;
    return (
        <TooltipBox
            title={formatMonthLong(point.month)}
            rows={[
                { name: 'Ingresos', value: formatEuro(point.income) },
                { name: 'Gastos', value: formatEuro(point.expenses) },
                { name: point.savings >= 0 ? 'Ahorro' : 'Déficit', value: formatSignedEuro(point.savings), color: point.savings >= 0 ? GOOD : BAD, total: true },
            ]}
        />
    );
}

// Ahorro de cada mes del año. Verde si ese mes se ahorró, rojo si se gastó más de lo ingresado:
// el color significa «bueno/malo» y la barra, además, queda por encima o por debajo del cero.
// data: [{ month: 'AAAA-MM', income, expenses, savings }].
export default function SavingsChart({ data }) {
    return (
        <Measured render={({ width, height, isMobile }) => (
            <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--border-color)" strokeDasharray="3 3" />
                <XAxis
                    dataKey="month"
                    tickFormatter={formatMonthShort}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    interval={isMobile && width < 420 ? 1 : 0}
                />
                <YAxis tickFormatter={formatAxisEuro} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={isMobile ? 64 : 76} />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" />
                <Tooltip content={<SavingsTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.6 }} />
                <Bar dataKey="savings" name="Ahorro" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 28 : 44} isAnimationActive={false}>
                    {data.map(point => <Cell key={point.month} fill={point.savings >= 0 ? GOOD : BAD} />)}
                </Bar>
            </BarChart>
        )} />
    );
}
