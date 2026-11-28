'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AmountInput, Field } from '@/components/ui';
import { formatDate, todayKey } from '@/lib/dateFormat';
import {
    EXPENSE_TYPES, KIND_TEXT, NEW_CATEGORY, PAYMENT_METHODS,
    emptyMovementForm, findCategory, formFromRecord, movementPayload, pickCategory,
} from '@/lib/movementForm';
import { fetchCategories } from './movementsApi';
import { useMovementActions } from './useMovementActions';
import styles from './movements.module.css';

// Última categoría usada por tipo, para no tener que elegirla cada vez.
const lastCategoryKey = kind => `nextfinance:ultima-categoria:${kind}`;

function readLastCategory(kind) {
    try {
        return window.localStorage.getItem(lastCategoryKey(kind)) || '';
    } catch {
        return '';
    }
}

function writeLastCategory(kind, name) {
    try {
        window.localStorage.setItem(lastCategoryKey(kind), name);
    } catch {
        // Sin almacenamiento (modo privado o bloqueado): la próxima vez empieza por la primera.
    }
}

// Opciones de un select que incluyen el valor guardado aunque ya no esté en la lista.
const withCurrent = (options, current) => (current && !options.includes(current) ? [current, ...options] : options);

const FIELD_ORDER = ['amount', 'category', 'date', 'subcategory', 'source', 'notes'];
const DETAIL_FIELDS = ['subcategory', 'source', 'notes'];

// Formulario único de gasto e ingreso: Inicio, Registro y el botón «+» de cualquier pantalla.
// kind: 'expense' | 'income'. Con onKindChange (y sin record) enseña el selector Gasto/Ingreso.
// Con record edita ese movimiento. onSaved(saved) se llama tras guardar.
export default function MovementForm({ kind, onKindChange, record = null, onSaved, onCancel, onDelete, autoFocus = false }) {
    const id = useId();
    const { save } = useMovementActions();
    const editing = Boolean(record);
    const text = KIND_TEXT[kind];

    const [form, setForm] = useState(() => (record ? formFromRecord(record) : emptyMovementForm({ today: todayKey() })));
    const [categories, setCategories] = useState({ kind: null, list: [], error: '' });
    const [categoriesTry, setCategoriesTry] = useState(0);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);
    const [moreOpen, setMoreOpen] = useState(() => Boolean(record && (record.notes || record.subcategory || record.source)));
    const amountRef = useRef(null);

    // En una ventana <dialog>, el foco inicial va al elemento con el atributo autofocus.
    // React no lo escribe en el HTML (enfoca él mismo antes de abrir la ventana), así que se pone aquí.
    const setAmountRef = useCallback(element => {
        amountRef.current = element;
        if (element && autoFocus) element.setAttribute('autofocus', '');
    }, [autoFocus]);

    useEffect(() => {
        const controller = new AbortController();
        fetchCategories(kind, controller.signal)
            .then(list => {
                setCategories({ kind, list, error: '' });
                // Sin categoría elegida: la última usada o la primera; si no hay ninguna, crear una.
                setForm(current => (current.category ? current : { ...current, category: pickCategory(list, readLastCategory(kind)) || NEW_CATEGORY }));
            })
            .catch(error => {
                if (!controller.signal.aborted) setCategories({ kind, list: [], error: error.message });
            });
        return () => controller.abort();
    }, [kind, categoriesTry]);

    const categoriesReady = categories.kind === kind && !categories.error;
    const categoriesError = categories.kind === kind ? categories.error : '';
    const categoryNames = withCurrent(categoriesReady ? categories.list.map(category => category.name) : [], form.category === NEW_CATEGORY ? '' : form.category);
    const creatingCategory = form.category === NEW_CATEGORY;
    const existingMatch = creatingCategory && categoriesReady ? findCategory(categories.list, form.newCategory) : null;
    const today = todayKey();

    const update = (field, value) => {
        setForm(current => ({ ...current, [field]: value }));
        const errorField = field === 'newCategory' ? 'category' : field;
        if (errors[errorField]) setErrors(current => ({ ...current, [errorField]: undefined }));
    };

    const chooseCategory = value => {
        update('category', value);
        if (value === NEW_CATEGORY) requestAnimationFrame(() => document.getElementById(`${id}-new-category`)?.focus());
    };

    const switchKind = next => {
        if (next === kind) return;
        setForm(current => ({ ...current, category: '', newCategory: '', subcategory: '', source: '' }));
        setErrors({});
        setFormError('');
        onKindChange(next);
    };

    const focusFirstError = found => {
        const field = FIELD_ORDER.find(name => found[name]);
        if (!field) return;
        if (DETAIL_FIELDS.includes(field)) setMoreOpen(true);
        const target = field === 'category' && creatingCategory ? `${id}-new-category` : `${id}-${field}`;
        requestAnimationFrame(() => document.getElementById(target)?.focus());
    };

    const submit = async event => {
        event.preventDefault();
        if (saving) return;
        setFormError('');
        const draft = { ...form, category: creatingCategory ? (existingMatch || form.newCategory) : form.category };
        const { value, errors: found } = movementPayload(kind, draft);
        if (found) {
            if (found.category && creatingCategory) found.category = 'Escribe el nombre de la categoría nueva';
            setErrors(found);
            focusFirstError(found);
            return;
        }
        setErrors({});
        setSaving(true);
        try {
            const saved = await save(kind, value, record);
            writeLastCategory(kind, value.category);
            if (creatingCategory && !existingMatch) {
                setCategories(current => ({ ...current, list: [...current.list, { id: `nueva-${value.category}`, name: value.category }].sort((a, b) => a.name.localeCompare(b.name, 'es')) }));
            }
            if (!editing) {
                // Listo para el siguiente: misma categoría, fecha y método; importe y detalles vacíos.
                setForm(current => ({ ...current, amount: '', category: value.category, newCategory: '', subcategory: '', source: '', notes: '' }));
                amountRef.current?.focus();
            }
            onSaved?.(saved);
        } catch (error) {
            setFormError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const describe = (field, hint) => (errors[field] ? `${id}-${field}-error` : hint ? `${id}-${field}-ayuda` : undefined);

    return (
        <form className={styles.form} onSubmit={submit} noValidate>
            {onKindChange && !editing && (
                <div className={styles.kindToggle} role="group" aria-label="Tipo de movimiento">
                    {['expense', 'income'].map(option => (
                        <button
                            key={option}
                            type="button"
                            className={`${styles.kindOption} ${option === kind ? styles.kindOptionActive : ''}`.trim()}
                            aria-pressed={option === kind}
                            onClick={() => switchKind(option)}
                        >
                            {KIND_TEXT[option].title}
                        </button>
                    ))}
                </div>
            )}

            <Field label="Importe (€)" htmlFor={`${id}-amount`} error={errors.amount}>
                <AmountInput
                    id={`${id}-amount`}
                    ref={setAmountRef}
                    className={styles.amountInput}
                    value={form.amount}
                    onChange={value => update('amount', value)}
                    aria-invalid={errors.amount ? true : undefined}
                    aria-describedby={describe('amount')}
                />
            </Field>

            <Field label="Categoría" htmlFor={`${id}-category`} error={creatingCategory ? undefined : errors.category}>
                <select
                    id={`${id}-category`}
                    className="form-input form-select"
                    value={categoriesReady || form.category ? form.category : ''}
                    onChange={event => chooseCategory(event.target.value)}
                    disabled={!categoriesReady && !categoriesError}
                    aria-invalid={errors.category && !creatingCategory ? true : undefined}
                    aria-describedby={creatingCategory ? undefined : describe('category')}
                >
                    {!categoriesReady && !categoriesError && <option value="">Cargando categorías…</option>}
                    {(categoriesReady || categoriesError) && !form.category && <option value="">Elige una categoría</option>}
                    {categoryNames.map(name => <option key={name} value={name}>{name}</option>)}
                    {(categoriesReady || categoriesError) && <option value={NEW_CATEGORY}>+ Nueva categoría</option>}
                </select>
            </Field>
            {categoriesError && (
                <p className={styles.inlineError} role="alert">
                    {categoriesError}{' '}
                    <button type="button" className={styles.linkButton} onClick={() => setCategoriesTry(value => value + 1)}>Reintentar</button>
                </p>
            )}
            {creatingCategory && (
                <Field
                    label={`Nombre de la categoría nueva de ${text.many}`}
                    htmlFor={`${id}-new-category`}
                    error={errors.category}
                    hint={existingMatch ? `Ya tienes «${existingMatch}»: se usará esa.` : undefined}
                >
                    <input
                        id={`${id}-new-category`}
                        type="text"
                        className="form-input"
                        maxLength={100}
                        autoComplete="off"
                        value={form.newCategory}
                        onChange={event => update('newCategory', event.target.value)}
                        aria-invalid={errors.category ? true : undefined}
                        aria-describedby={errors.category ? `${id}-new-category-error` : existingMatch ? `${id}-new-category-ayuda` : undefined}
                    />
                </Field>
            )}

            <div className={kind === 'expense' ? styles.pairRow : undefined}>
                <Field
                    label="Fecha"
                    htmlFor={`${id}-date`}
                    error={errors.date}
                    hint={form.date && form.date !== today ? `No es hoy: se apuntará el ${formatDate(form.date)}.` : undefined}
                >
                    <input
                        id={`${id}-date`}
                        type="date"
                        className="form-input"
                        value={form.date}
                        onChange={event => update('date', event.target.value)}
                        aria-invalid={errors.date ? true : undefined}
                        aria-describedby={describe('date', form.date && form.date !== today)}
                    />
                </Field>
                {kind === 'expense' && (
                    <Field label="Método de pago" htmlFor={`${id}-payment`}>
                        <select id={`${id}-payment`} className="form-input form-select" value={form.payment_method} onChange={event => update('payment_method', event.target.value)}>
                            {withCurrent(PAYMENT_METHODS, form.payment_method).map(option => <option key={option} value={option}>{option}</option>)}
                            <option value="">Sin indicar</option>
                        </select>
                    </Field>
                )}
            </div>

            {kind === 'expense' && (
                <Field label="Tipo de gasto" htmlFor={`${id}-type`}>
                    <select id={`${id}-type`} className="form-input form-select" value={form.expense_type} onChange={event => update('expense_type', event.target.value)}>
                        {withCurrent(EXPENSE_TYPES, form.expense_type).map(option => <option key={option} value={option}>{option}</option>)}
                        <option value="">Sin indicar</option>
                    </select>
                </Field>
            )}

            <details className={styles.more} open={moreOpen} onToggle={event => setMoreOpen(event.currentTarget.open)}>
                <summary>Más detalles</summary>
                <div className={styles.moreBody}>
                    {kind === 'expense' ? (
                        <Field label="Subcategoría (opcional)" htmlFor={`${id}-subcategory`} error={errors.subcategory}>
                            <input id={`${id}-subcategory`} type="text" className="form-input" maxLength={100} placeholder="Por ejemplo, Netflix" value={form.subcategory} onChange={event => update('subcategory', event.target.value)} aria-invalid={errors.subcategory ? true : undefined} aria-describedby={describe('subcategory')} />
                        </Field>
                    ) : (
                        <Field label="Fuente (opcional)" htmlFor={`${id}-source`} error={errors.source}>
                            <input id={`${id}-source`} type="text" className="form-input" maxLength={150} placeholder="Por ejemplo, Empresa ABC" value={form.source} onChange={event => update('source', event.target.value)} aria-invalid={errors.source ? true : undefined} aria-describedby={describe('source')} />
                        </Field>
                    )}
                    <Field label="Notas (opcional)" htmlFor={`${id}-notes`} error={errors.notes}>
                        <textarea id={`${id}-notes`} className={`form-input ${styles.notes}`} rows={2} value={form.notes} onChange={event => update('notes', event.target.value)} aria-invalid={errors.notes ? true : undefined} aria-describedby={describe('notes')} />
                    </Field>
                </div>
            </details>

            {formError && <p className={styles.inlineError} role="alert">{formError}</p>}

            <div className={styles.formActions}>
                {editing && onDelete && (
                    <button type="button" className={`btn btn-secondary ${styles.deleteAction}`} onClick={onDelete} disabled={saving}>
                        Eliminar
                    </button>
                )}
                {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>}
                <button type="submit" className={`btn ${kind === 'income' ? 'btn-success' : 'btn-primary'}`} disabled={saving}>
                    {saving ? 'Guardando…' : editing ? 'Guardar cambios' : `Guardar ${text.one}`}
                </button>
            </div>
        </form>
    );
}
