'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import styles from './ui.module.css';

const FeedbackContext = createContext(null);

// Avisos (toasts) y confirmaciones para toda la app. Se monta una vez en Providers.
export function FeedbackProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const nextId = useRef(1);

    const dismiss = useCallback(id => setToasts(list => list.filter(toast => toast.id !== id)), []);

    // toast({ type: 'success' | 'error', text, action: { label, onClick } })
    const toast = useCallback(({ type = 'success', text, action, duration }) => {
        const id = nextId.current++;
        setToasts(list => [...list.slice(-2), { id, type, text, action }]);
        setTimeout(() => dismiss(id), duration ?? (type === 'error' ? 8000 : action ? 7000 : 4000));
        return id;
    }, [dismiss]);

    // await confirm({ title, text, confirmLabel, danger }) → true o false.
    const confirm = useCallback(options => new Promise(resolve => {
        setConfirmState({ title: 'Confirmar', confirmLabel: 'Aceptar', ...(typeof options === 'string' ? { text: options } : options), resolve });
    }), []);

    const answer = value => {
        confirmState?.resolve(value);
        setConfirmState(null);
    };

    const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}
            <div className={styles.toasts} role="status" aria-live="polite">
                {toasts.map(item => (
                    <div key={item.id} className={`${styles.toast} ${item.type === 'error' ? styles.toastError : ''}`.trim()} role={item.type === 'error' ? 'alert' : undefined}>
                        <span className={styles.toastText}>{item.text}</span>
                        {item.action && <button type="button" className={styles.toastAction} onClick={() => { item.action.onClick(); dismiss(item.id); }}>{item.action.label}</button>}
                        <button type="button" className={styles.toastClose} onClick={() => dismiss(item.id)} aria-label="Cerrar aviso">×</button>
                    </div>
                ))}
            </div>
            <Modal
                open={Boolean(confirmState)}
                onClose={() => answer(false)}
                title={confirmState?.title}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={() => answer(false)}>{confirmState?.cancelLabel || 'Cancelar'}</button>
                    <button type="button" className={`btn ${confirmState?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)} autoFocus>{confirmState?.confirmLabel}</button>
                </>}
            >
                <p>{confirmState?.text}</p>
            </Modal>
        </FeedbackContext.Provider>
    );
}

export function useFeedback() {
    const context = useContext(FeedbackContext);
    if (!context) throw new Error('useFeedback necesita FeedbackProvider');
    return context;
}
