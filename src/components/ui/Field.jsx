import styles from './ui.module.css';

// Campo de formulario con su etiqueta asociada (htmlFor), ayuda y error accesibles.
// El hijo debe ser el control con el mismo id que htmlFor.
export default function Field({ label, htmlFor, hint, error, className = '', children }) {
    return (
        <div className={`form-group ${styles.field} ${className}`.trim()}>
            <label className={`form-label ${styles.label}`} htmlFor={htmlFor}>{label}</label>
            {children}
            {hint && !error && <small id={`${htmlFor}-ayuda`} className={styles.hint}>{hint}</small>}
            {error && <small id={`${htmlFor}-error`} className={styles.error} role="alert">{error}</small>}
        </div>
    );
}
