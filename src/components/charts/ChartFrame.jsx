import styles from './charts.module.css';

// Marco de un gráfico (Tarea NF-20): título, caja de alto fijo y leyenda. No usa hooks, así que lo puede
// pintar el servidor; dentro va el gráfico (una isla de cliente que se carga aparte) o contenido HTML.
// height*: alto de la caja en px. Con boxHeight={false} la caja toma el alto de su contenido.
export default function ChartFrame({
    title,
    subtitle,
    actions,
    heightMobile = 260,
    heightDesktop = 320,
    boxHeight = true,
    className = '',
    boxClassName = '',
    overlay,
    legend,
    footer,
    children,
}) {
    const boxStyle = boxHeight ? { '--chart-h-mobile': `${heightMobile}px`, '--chart-h-desktop': `${heightDesktop}px` } : undefined;
    return (
        <div className={`chart-wrapper ${styles.frame} ${className}`.trim()}>
            {(title || subtitle || actions) && (
                <div className={styles.head}>
                    <div>
                        {title && <h3 className="chart-title">{title}</h3>}
                        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                    </div>
                    {actions}
                </div>
            )}
            <div className={`${boxHeight ? styles.box : ''} ${boxClassName}`.trim() || undefined} style={boxStyle}>
                {overlay}
                {children}
            </div>
            {legend}
            {footer}
        </div>
    );
}
