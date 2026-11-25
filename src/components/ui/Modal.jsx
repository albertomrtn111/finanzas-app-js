'use client';

import { useEffect, useId, useRef } from 'react';
import styles from './ui.module.css';

// Ventana modal con <dialog>: retiene el foco, se cierra con Escape y devuelve el foco al cerrar.
// No se cierra al pulsar fuera para no perder lo escrito.
export default function Modal({ open, onClose, title, children, footer, className = '' }) {
    const ref = useRef(null);
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className={`${styles.dialog} ${className}`.trim()}
            aria-labelledby={titleId}
            onCancel={event => { event.preventDefault(); onClose?.(); }}
        >
            {open && <>
                <div className={styles.dialogHeader}>
                    <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">×</button>
                </div>
                <div className={styles.dialogBody}>{children}</div>
                {footer && <div className={styles.dialogFooter}>{footer}</div>}
            </>}
        </dialog>
    );
}
