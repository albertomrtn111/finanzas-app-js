
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
        <div style={{
            background: 'rgba(15, 23, 42, 0.95)', // Slate 900
            border: '1px solid rgba(51, 65, 85, 0.5)', // Slate 700
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            zIndex: 50,
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.875rem', // text-sm
            fontWeight: 500
        }}>
            <span style={{ color: '#D1D5DB' }}>{name}</span> {/* Gray 300 */}
            <span style={{ color: '#4B5563' }}>·</span> {/* Gray 600 separator */}
            <span style={{ color: '#FFFFFF', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(value)}
            </span>
            <span style={{ color: '#34D399', fontSize: '0.75rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {percentStr}
            </span>
        </div>
    );
};

export default PieTooltip;
