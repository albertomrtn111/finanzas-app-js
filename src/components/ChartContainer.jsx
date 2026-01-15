'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * ChartContainer - Wrapper for Recharts that ensures proper sizing on mobile
 * 
 * Uses ResizeObserver to measure actual container dimensions and only mounts
 * the chart when dimensions are valid. Remounts chart via key when dimensions
 * change significantly to force Recharts to recalculate.
 * 
 * @param {string} title - Chart title
 * @param {React.ReactNode} children - ResponsiveContainer with chart
 * @param {number} heightMobile - Height in px for mobile (default: 260)
 * @param {number} heightDesktop - Height in px for desktop (default: 320)
 * @param {string} className - Additional CSS classes
 */
export default function ChartContainer({
    title,
    children,
    heightMobile = 260,
    heightDesktop = 320,
    className = ''
}) {
    const containerRef = useRef(null);
    const [dims, setDims] = useState({ w: 0, h: 0 });
    const [renderKey, setRenderKey] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    // Determine container height based on viewport
    const containerHeight = isMobile ? heightMobile : heightDesktop;

    // Debug mode from env
    const isDebug = process.env.NEXT_PUBLIC_CHART_DEBUG === 'true';

    // Check if mobile on mount and resize
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // ResizeObserver to track container dimensions
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDims((prev) => {
                    // Only update if dimensions changed significantly
                    if (Math.abs(prev.w - width) > 5 || Math.abs(prev.h - height) > 5) {
                        return { w: Math.floor(width), h: Math.floor(height) };
                    }
                    return prev;
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // Bump render key when dimensions become valid (from 0 to valid)
    useEffect(() => {
        if (dims.w > 0 && dims.h > 0) {
            setRenderKey((k) => k + 1);
        }
    }, [dims.w > 0 && dims.h > 0]);

    // Handle layout change event (from sidebar)
    const handleLayoutChange = useCallback(() => {
        // Small delay to let layout settle, then bump key to force remeasure
        setTimeout(() => {
            setRenderKey((k) => k + 1);
        }, 100);
    }, []);

    // Listen to custom layout change event and iOS-specific events
    useEffect(() => {
        // Custom event from sidebar
        window.addEventListener('app:layoutchange', handleLayoutChange);

        // iOS orientation change
        window.addEventListener('orientationchange', handleLayoutChange);

        // iOS visualViewport resize (for keyboard, toolbar changes)
        const viewport = window.visualViewport;
        if (viewport) {
            viewport.addEventListener('resize', handleLayoutChange);
        }

        return () => {
            window.removeEventListener('app:layoutchange', handleLayoutChange);
            window.removeEventListener('orientationchange', handleLayoutChange);
            if (viewport) {
                viewport.removeEventListener('resize', handleLayoutChange);
            }
        };
    }, [handleLayoutChange]);

    // Determine if we should show the chart
    const showChart = dims.w > 0 && dims.h > 0;

    return (
        <div
            className={`chart-wrapper ${className}`}
            style={{
                width: '100%',
                minWidth: 0,
                position: 'relative',
            }}
        >
            {title && <h3 className="chart-title">{title}</h3>}
            <div
                ref={containerRef}
                className="chart-inner"
                style={{
                    width: '100%',
                    minWidth: 0,
                    height: containerHeight,
                    position: 'relative',
                }}
            >
                {showChart ? (
                    <div key={`chart-${renderKey}`} style={{ width: '100%', height: '100%' }}>
                        {children}
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'var(--text-muted)',
                            fontSize: '0.875rem',
                        }}
                    >
                        Cargando gráfico…
                    </div>
                )}
            </div>
            {isDebug && (
                <div
                    style={{
                        marginTop: '8px',
                        padding: '4px 8px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        color: 'var(--text-muted)',
                    }}
                >
                    Chart size: {dims.w}x{dims.h} - key: {renderKey} - mobile: {isMobile ? 'yes' : 'no'}
                </div>
            )}
        </div>
    );
}
