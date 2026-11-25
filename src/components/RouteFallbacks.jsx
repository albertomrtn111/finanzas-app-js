import { LoadState, VisuallyHidden } from './ui/States';
import styles from './RouteFallbacks.module.css';

// Esqueleto de página mientras el servidor prepara los datos (loading.js). Sin hooks: lo pinta el servidor
// y Next.js lo puede enviar por adelantado para que la navegación sea inmediata (Tarea NF-20).
export function PageSkeleton({ label = 'Cargando la página…', kpis = 4, charts = 2 }) {
    return (
        <div className={`page-container ${styles.page}`} role="status" aria-live="polite">
            <VisuallyHidden>{label}</VisuallyHidden>
            <div aria-hidden="true">
                <div className={`${styles.block} ${styles.title}`} />
                <div className={`${styles.block} ${styles.subtitle}`} />
                <div className={styles.kpis}>
                    {Array.from({ length: kpis }, (_, i) => <div key={i} className={`${styles.block} ${styles.kpi}`} />)}
                </div>
                <div className={styles.charts}>
                    {Array.from({ length: charts }, (_, i) => <div key={i} className={`${styles.block} ${styles.chart}`} />)}
                </div>
            </div>
        </div>
    );
}

// Error de página (error.js): nunca se presenta como «no hay datos». Ofrece «Reintentar», que vuelve a
// pedir la página al servidor. El detalle técnico no se enseña; la referencia sirve para buscar en el registro.
export function RouteError({ error, onRetry, text = 'Ha fallado la conexión con el servidor o con la base de datos. Tus datos no se han perdido.' }) {
    const digest = error && typeof error === 'object' && 'digest' in error ? error.digest : null;
    return (
        <div className="page-container">
            <div className={styles.error}>
                <LoadState error={text} onRetry={onRetry} />
                {digest && <p className={styles.reference}>Referencia del error: {digest}</p>}
            </div>
        </div>
    );
}
