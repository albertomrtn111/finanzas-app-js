import { formatEuro, formatSignedEuro } from '@/lib/moneyFormat';
import styles from './ui.module.css';

// Importe en euros con formato español. Con signed muestra «+»/«−» y color según el signo;
// tone="positive" o "negative" fuerza el color.
export default function Money({ value, signed = false, tone, className = '' }) {
    const number = Number(value) || 0;
    const resolved = tone || (signed ? (number > 0 ? 'positive' : number < 0 ? 'negative' : '') : '');
    return <span className={`${styles.amount} ${resolved ? styles[resolved] : ''} ${className}`.trim()}>{signed ? formatSignedEuro(number) : formatEuro(number)}</span>;
}
