import styles from './ui.module.css';

// Carga, error con «Reintentar» o contenido. Un error nunca se muestra como «no hay datos».
export function LoadState({ loading, error, onRetry, label = 'Cargando…', children = null }) {
    if (loading) {
        return <div className={styles.state} role="status"><div className={styles.spinner} aria-hidden="true" /><span>{label}</span></div>;
    }
    if (error) {
        return (
            <div className={styles.state} role="alert">
                <span className={styles.stateTitle}>No se han podido cargar los datos</span>
                <span>{error}</span>
                {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Reintentar</button>}
            </div>
        );
    }
    return children;
}

// Pantalla vacía con una acción para empezar.
export function EmptyState({ title, text, action }) {
    return (
        <div className={styles.state}>
            {title && <span className={styles.stateTitle}>{title}</span>}
            {text && <span>{text}</span>}
            {action}
        </div>
    );
}

export function VisuallyHidden({ children }) {
    return <span className={styles.srOnly}>{children}</span>;
}
