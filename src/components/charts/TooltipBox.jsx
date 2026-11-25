import styles from './charts.module.css';

// Caja de tooltip legible en claro y en oscuro (Tarea NF-20).
// rows: [{ name, value (texto ya formateado), color?, total? }].
export default function TooltipBox({ title, rows }) {
    return (
        <div className={styles.tooltip}>
            {title && <p className={styles.tooltipTitle}>{title}</p>}
            {rows.map(row => (
                <div key={row.name} className={`${styles.tooltipRow} ${row.total ? styles.tooltipTotal : ''}`.trim()}>
                    {row.color && <span aria-hidden="true" className={styles.swatch} style={{ background: row.color }} />}
                    <span className={styles.tooltipName}>{row.name}</span>
                    <span className={styles.tooltipValue}>{row.value}</span>
                </div>
            ))}
        </div>
    );
}
