'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal } from '@/components/ui';
import { KIND_TEXT } from '@/lib/movementForm';
import MovementForm from './MovementForm';
import { useMovementActions } from './useMovementActions';
import styles from './movements.module.css';

const MovementDialogContext = createContext(null);

// Envuelve las pantallas personales (layout del panel): botón flotante «+» en todas ellas y una
// única ventana para apuntar o editar gastos e ingresos. Las pantallas la abren con
// useMovementDialog().openMovement({ kind, record }).
export function MovementsProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const { remove } = useMovementActions();

    const openMovement = useCallback(({ kind = 'expense', record = null } = {}) => {
        setDialog(current => ({ kind, record, key: (current?.key ?? 0) + 1 }));
    }, []);
    const close = useCallback(() => setDialog(null), []);
    const value = useMemo(() => ({ openMovement }), [openMovement]);

    const kindText = dialog ? KIND_TEXT[dialog.kind] : null;
    const title = dialog ? `${dialog.record ? 'Editar' : 'Nuevo'} ${kindText.one}` : '';

    const deleteOpen = async () => {
        if (dialog?.record && await remove(dialog.kind, dialog.record)) close();
    };

    return (
        <MovementDialogContext.Provider value={value}>
            {children}
            <button
                type="button"
                className={styles.fab}
                aria-label="Añadir gasto o ingreso"
                title="Añadir gasto o ingreso"
                onClick={() => openMovement()}
            >
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
            </button>
            <Modal open={Boolean(dialog)} onClose={close} title={title} className={styles.dialog}>
                {dialog && (
                    <MovementForm
                        key={dialog.key}
                        kind={dialog.kind}
                        record={dialog.record}
                        onKindChange={dialog.record ? undefined : kind => setDialog(current => (current ? { ...current, kind } : current))}
                        onSaved={close}
                        onCancel={close}
                        onDelete={dialog.record ? deleteOpen : undefined}
                        // Al apuntar, el cursor va al importe; al abrir uno para editarlo, no salta el teclado.
                        autoFocus={!dialog.record}
                    />
                )}
            </Modal>
        </MovementDialogContext.Provider>
    );
}

export function useMovementDialog() {
    const context = useContext(MovementDialogContext);
    if (!context) throw new Error('useMovementDialog necesita MovementsProvider');
    return context;
}

// Hueco al final de cada pantalla para que el botón flotante no tape lo último de la página.
export function FabSpacer() {
    return <div className={styles.fabSpacer} aria-hidden="true" />;
}
