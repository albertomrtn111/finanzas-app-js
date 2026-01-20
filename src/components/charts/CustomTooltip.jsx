
import React from 'react';

const CustomTooltip = ({ active, payload, label, formatter }) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    return (
        <div style={{
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: '10px',
            padding: '10px 12px',
            color: '#E5E7EB',
            fontSize: '13px', // Slightly increased for readability
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 1000
        }}>
            {label && <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#F3F4F6' }}>{label}</p>}
            {payload.map((entry, index) => {
                // Use provided formatter or fallback
                const val = formatter ? formatter(entry.value, entry.name, entry) :
                    (typeof entry.value === 'number' ? entry.value.toLocaleString('es-ES') : entry.value);

                return (
                    <p key={index} style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color || entry.fill // Fallback for some chart types
                        }} />
                        <span style={{ color: '#9CA3AF' }}>{entry.name}:</span>
                        <span style={{ fontWeight: 500, color: '#E5E7EB' }}>{val}</span>
                    </p>
                );
            })}
        </div>
    );
};

export default CustomTooltip;
