import { formatSignedEuro, formatSignedPct } from '@/lib/moneyFormat';
import styles from './charts.module.css';

// Variación con signo: «▲ +1.250,00 € (+5,2 %)». Verde si sube y rojo si baja; la flecha y el signo
// dicen lo mismo sin depender del color.
export default function Change({ value, pct, suffix }) {
    const tone = value > 0 ? styles.good : value < 0 ? styles.bad : '';
    return (
        <span className={tone}>
            {value !== 0 && <span aria-hidden="true">{value > 0 ? '▲ ' : '▼ '}</span>}
            {formatSignedEuro(value)}
            {pct !== null && pct !== undefined && ` (${formatSignedPct(pct)})`}
            {suffix && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> {suffix}</span>}
        </span>
    );
}
