'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * ChartContainer - Wrapper for Recharts that ensures proper sizing on mobile
 * 
 * Uses ResizeObserver to measure actual container dimensions and only mounts
 * the chart when dimensions are valid.
 * 
 * Supports two modes:
 * 1. render prop: render({ width, height, isMobile }) - recommended for mobile
 * 2. children: for backwards compatibility with ResponsiveContainer
 * 
 * @param {string} title - Chart title
 * @param {Function} render - Render prop: ({ width, height, isMobile }) => ReactNode
 * @param {React.ReactNode} children - Fallback if render not provided
 * @param {number} heightMobile - Height in px for mobile (default: 260)
 * @param {number} heightDesktop - Height in px for desktop (default: 320)
 * @param {string} className - Additional CSS classes
 */
export default function ChartContainer({
    title,
    render,
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
                    if (Math.abs(prev.w - width) > 2 || Math.abs(prev.h - height) > 2) {
                        return { w: Math.floor(width), h: Math.floor(height) };
                    }
                    return prev;
                });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // Bump render key when dimensions become valid
    useEffect(() => {
        if (dims.w > 0 && dims.h > 0) {
            setRenderKey((k) => k + 1);
        }
    }, [dims.w > 0 && dims.h > 0]);

    // Handle layout change event (from sidebar)
    const handleLayoutChange = useCallback(() => {
        setTimeout(() => {
            setRenderKey((k) => k + 1);
        }, 100);
    }, []);

    // Listen to custom layout change event and iOS-specific events
    useEffect(() => {
        window.addEventListener('app:layoutchange', handleLayoutChange);
        window.addEventListener('orientationchange', handleLayoutChange);

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

    // Render content - prefer render prop, fallback to children
    const renderContent = () => {
        if (render && typeof render === 'function') {
            return render({ width: dims.w, height: dims.h, isMobile });
        }
        return children;
    };

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
                        {renderContent()}
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
