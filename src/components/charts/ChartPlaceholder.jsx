import styles from './charts.module.css';

// Hueco del gráfico mientras llega su código (mismo alto que el gráfico: la página no salta).
export default function ChartPlaceholder() {
    return <div className={styles.placeholder} aria-hidden="true" />;
}
