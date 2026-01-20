
import React from 'react';

const CustomTooltip = ({ active, payload, label, formatter, totalValue }) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: '10px',
            padding: '10px 12px',
            color: '#E5E7EB',
            fontSize: '13px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            {label && <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#F3F4F6', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>{label}</p>}
            {payload.map((entry, index) => {
                // Use provided formatter or fallback
                const val = formatter ? formatter(entry.value, entry.name, entry) :
                    (typeof entry.value === 'number' ? entry.value.toLocaleString('es-ES') : entry.value);

                // Calculate percent if totalValue is provided and value is number
                let percentStr = '';
                if (totalValue && typeof entry.value === 'number' && totalValue > 0) {
                    const pct = (entry.value / totalValue) * 100;
                    percentStr = ` (${pct.toFixed(1)}%)`;
                }

                return (
                    <div key={index} style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color || entry.fill || entry.payload?.fill
                        }} />
                        <span style={{ color: '#9CA3AF' }}>{entry.name}:</span>
                        <span style={{ fontWeight: 500, color: '#E5E7EB' }}>
                            {val}
                            <span style={{ color: '#60A5FA', marginLeft: '4px', fontSize: '0.9em' }}>{percentStr}</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default CustomTooltip;
