'use client';

import ChartFrame from './charts/ChartFrame';
import Measured from './charts/Measured';

/**
 * ChartContainer: tarjeta con título y una caja de alto fijo para un gráfico de Recharts.
 *
 * Mide la caja con un ResizeObserver y llama a render({ width, height, isMobile }) con el tamaño
 * real. Desde la Tarea NF-20 el gráfico ya no se vuelve a montar al cambiar el tamaño, al desplazarse
 * en iPhone (la barra de Safari cambia el alto de la ventana) ni al abrir o cerrar el menú lateral:
 * solo se vuelve a pintar si cambia el tamaño de su caja.
 *
 * @param {string} title - Título del gráfico
 * @param {Function} render - ({ width, height, isMobile }) => ReactNode
 * @param {React.ReactNode} children - Alternativa a render (por ejemplo, un ResponsiveContainer)
 * @param {number} heightMobile - Alto en px por debajo de 768 px (por defecto 260)
 * @param {number} heightDesktop - Alto en px en escritorio (por defecto 320)
 * @param {string} className - Clases extra de la tarjeta
 * @param {any} refreshKey - Ya no hace falta; se acepta por compatibilidad y no hace nada
 */
export default function ChartContainer({
    title,
    render,
    children,
    heightMobile = 260,
    heightDesktop = 320,
    className = '',
}) {
    return (
        <ChartFrame
            title={title}
            heightMobile={heightMobile}
            heightDesktop={heightDesktop}
            className={className}
            boxClassName="chart-inner"
        >
            {typeof render === 'function' ? <Measured render={render} /> : children}
        </ChartFrame>
    );
}
