
import React from 'react';
import { formatCurrency, formatPercent } from '@/lib/chartUtils';

const PieTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const data = payload[0];
    const name = data.name;
    const value = data.value;

    // Recharts Pie injects 'percent' (0 to 1) into the payload object
    let percentStr = '';
    if (data.percent !== undefined) {
        percentStr = `(${formatPercent(data.percent * 100, 1)})`;
    } else if (data.payload && data.payload.percent !== undefined) {
        percentStr = `(${formatPercent(data.payload.percent * 100, 1)})`;
    }

    return (
        <div className="bg-slate-900/95 border border-slate-700/50 rounded-lg p-2.5 shadow-xl backdrop-blur-sm z-50">
            <div className="text-sm font-medium flex items-center gap-2">
                <span className="text-gray-300">{name}</span>
                <span className="h-4 w-px bg-slate-600 mx-1"></span>
                <span className="text-white font-bold tabular-nums">
                    {formatCurrency(value)}
                </span>
                <span className="text-emerald-400 text-xs tabular-nums font-semibold">
                    {percentStr}
                </span>
            </div>
        </div>
    );
};

export default PieTooltip;
