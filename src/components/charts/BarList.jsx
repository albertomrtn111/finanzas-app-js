import { formatEuro } from '@/lib/moneyFormat';
import styles from './charts.module.css';

// Ranking en barras horizontales hecho en HTML (Tarea NF-20): lo pinta el servidor, sin esperar a ningún
// script, y en móvil los nombres no se cortan en un eje. items: [{ key, label, value, color, meta? }].
export default function BarList({ items, limit = 8, moreText }) {
    const shown = items.slice(0, limit);
    const max = Math.max(0, ...shown.map(item => item.value));
    const hidden = items.length - shown.length;
    return (
        <>
            <ul className={styles.barList}>
                {shown.map(item => (
                    <li key={item.key ?? item.label}>
                        <div className={styles.barHead}>
                            <span className={styles.barLabel} title={item.label}>{item.label}</span>
                            {item.meta && <span className={styles.barMeta}>{item.meta}</span>}
                            <span className={styles.barValue}>{formatEuro(item.value)}</span>
                        </div>
                        <div className={styles.barTrack} aria-hidden="true">
                            <div className={styles.barFill} style={{ width: `${max > 0 ? Math.max(0, (item.value / max) * 100) : 0}%`, background: item.color }} />
                        </div>
                    </li>
                ))}
            </ul>
            {hidden > 0 && <p className={styles.barNote}>{moreText ? moreText(hidden) : `Y ${hidden} más en el detalle.`}</p>}
        </>
    );
}
