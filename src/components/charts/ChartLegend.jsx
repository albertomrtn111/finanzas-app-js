import { formatEuro, formatPct } from '@/lib/moneyFormat';
import styles from './charts.module.css';

// Leyenda en HTML (Tarea NF-20): se lee en móvil, a 13 px, y no depende del color: cada fila lleva
// nombre e importe. items: [{ name, color, value?, sharePct?, shape?: 'box' | 'line' | 'dashed' }].
export default function ChartLegend({ items, inline = false, columns = false, label }) {
    if (!items?.length) return null;
    const layout = inline ? styles.legendInline : columns ? styles.legendColumns : '';
    return (
        <ul className={`${styles.legend} ${layout}`.trim()} aria-label={label}>
            {items.map(item => (
                <li key={item.name} className={styles.legendItem} title={item.title || item.name}>
                    <span
                        aria-hidden="true"
                        className={item.shape === 'line' ? styles.swatchLine : item.shape === 'dashed' ? styles.swatchDashed : styles.swatch}
                        style={item.shape === 'line' || item.shape === 'dashed' ? { borderTopColor: item.color } : { background: item.color }}
                    />
                    <span className={styles.legendName}>{item.name}</span>
                    {item.value !== undefined && (
                        <span className={styles.legendValue}>
                            {formatEuro(item.value)}
                            {item.sharePct !== undefined && item.sharePct !== null && <span className={styles.legendPct}>{formatPct(item.sharePct)}</span>}
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );
}
