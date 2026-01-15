'use client';

import { useEffect, useRef } from 'react';

/**
 * ChartContainer - Wrapper for Recharts that ensures proper sizing on mobile
 * 
 * @param {string} title - Chart title
 * @param {React.ReactNode} children - ResponsiveContainer with chart
 * @param {number} heightMobile - Height in px for mobile (default: 260)
 * @param {number} heightDesktop - Height in px for desktop (default: 300)
 * @param {string} className - Additional CSS classes
 */
export default function ChartContainer({
    title,
    children,
    heightMobile = 260,
    heightDesktop = 300,
    className = ''
}) {
    const containerRef = useRef(null);

    // Force resize recalculation on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            ref={containerRef}
            className={`chart-wrapper ${className}`}
            style={{
                width: '100%',
                minWidth: 0,
                position: 'relative',
            }}
        >
            {title && <h3 className="chart-title">{title}</h3>}
            <div
                className="chart-inner"
                style={{
                    width: '100%',
                    minWidth: 0,
                    height: `var(--chart-height, ${heightDesktop}px)`,
                    position: 'relative',
                }}
            >
                <style jsx>{`
                    .chart-inner {
                        --chart-height: ${heightDesktop}px;
                    }
                    @media (max-width: 768px) {
                        .chart-inner {
                            --chart-height: ${heightMobile}px;
                        }
                    }
                `}</style>
                {children}
            </div>
        </div>
    );
}
