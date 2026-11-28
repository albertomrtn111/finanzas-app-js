'use client';

import { useCallback, useEffect, useEffectEvent, useMemo } from 'react';
import { useFeedback } from '@/components/ui';
import { formatDate } from '@/lib/dateFormat';
import { KIND_TEXT, movementSummary, recordToPayload } from '@/lib/movementForm';
import { deleteMovement, saveMovement } from './movementsApi';

// Aviso para que las pantallas que enseñan movimientos (Inicio, Registro…) recarguen sus datos
// en segundo plano cuando se crea, edita, borra o deshace uno desde cualquier sitio.
export const MOVEMENTS_EVENT = 'nextfinance:movimientos';

export function notifyMovementsChanged(detail) {
    window.dispatchEvent(new CustomEvent(MOVEMENTS_EVENT, { detail }));
}

// useMovementsChanged(detail => recargar()) — se suscribe mientras la pantalla está montada.
export function useMovementsChanged(callback) {
    const onChange = useEffectEvent(detail => callback(detail));
    useEffect(() => {
        const handler = event => onChange(event.detail);
        window.addEventListener(MOVEMENTS_EVENT, handler);
        return () => window.removeEventListener(MOVEMENTS_EVENT, handler);
    }, []);
}

// Guardar y borrar con aviso y «Deshacer», iguales en toda la app.
export function useMovementActions() {
    const { toast, confirm } = useFeedback();

    const fail = useCallback(text => toast({ type: 'error', text }), [toast]);

    // Deshacer una creación: borra el registro recién creado.
    const undoCreate = useCallback(async (kind, saved) => {
        try {
            await deleteMovement(kind, saved.id);
            notifyMovementsChanged({ kind, action: 'delete', id: saved.id });
            toast({ text: `Se ha deshecho el ${KIND_TEXT[kind].one} de ${movementSummary(saved)}` });
        } catch (error) {
            fail(`No se ha podido deshacer: ${error.message}`);
        }
    }, [toast, fail]);

    // Deshacer una edición: vuelve a dejar los valores anteriores.
    const undoUpdate = useCallback(async (kind, previous) => {
        try {
            await saveMovement(kind, recordToPayload(kind, previous), previous.id);
            notifyMovementsChanged({ kind, action: 'update', id: previous.id });
            toast({ text: `Cambios deshechos: vuelve a ser ${movementSummary(previous)}` });
        } catch (error) {
            fail(`No se ha podido deshacer: ${error.message}`);
        }
    }, [toast, fail]);

    // Deshacer un borrado: vuelve a crear el registro (con un id nuevo).
    const undoDelete = useCallback(async (kind, record) => {
        try {
            const restored = await saveMovement(kind, recordToPayload(kind, record));
            notifyMovementsChanged({ kind, action: 'create', id: restored.id });
            toast({ text: `${KIND_TEXT[kind].title} recuperado · ${movementSummary(restored)}` });
        } catch (error) {
            fail(`No se ha podido recuperar: ${error.message}`);
        }
    }, [toast, fail]);

    // Crea (sin previous) o edita (previous = registro antes del cambio). Lanza el error para
    // que el formulario lo enseñe junto a los campos.
    const save = useCallback(async (kind, payload, previous) => {
        const saved = await saveMovement(kind, payload, previous?.id);
        notifyMovementsChanged({ kind, action: previous ? 'update' : 'create', id: saved.id });
        toast({
            text: `${KIND_TEXT[kind].title} ${previous ? 'actualizado' : 'guardado'} · ${movementSummary(saved)}`,
            action: { label: 'Deshacer', onClick: () => (previous ? undoUpdate(kind, previous) : undoCreate(kind, saved)) },
        });
        return saved;
    }, [toast, undoCreate, undoUpdate]);

    // Pregunta antes de borrar. Devuelve true si se ha borrado.
    const remove = useCallback(async (kind, record) => {
        const { one } = KIND_TEXT[kind];
        const accepted = await confirm({
            title: `¿Eliminar este ${one}?`,
            text: `${movementSummary(record)}, del ${formatDate(record.date)}. Podrás deshacerlo justo después.`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!accepted) return false;
        try {
            await deleteMovement(kind, record.id);
        } catch (error) {
            fail(error.message);
            return false;
        }
        notifyMovementsChanged({ kind, action: 'delete', id: record.id });
        toast({
            text: `${KIND_TEXT[kind].title} eliminado · ${movementSummary(record)}`,
            action: { label: 'Deshacer', onClick: () => undoDelete(kind, record) },
        });
        return true;
    }, [confirm, toast, fail, undoDelete]);

    return useMemo(() => ({ save, remove }), [save, remove]);
}
