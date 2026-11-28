'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { formatDateTime } from '@/lib/dateFormat';
import { EXPENSE_TYPES, PAYMENT_METHODS } from '@/lib/movementForm';
import { jsonRequest, requestJson } from '@/lib/utils';
import { EmptyState, Field, LoadState, Modal, VisuallyHidden, useFeedback } from '@/components/ui';
import styles from './reglas.module.css';

// Configuración › Reglas de clasificación (Tarea NF-4). La IA parte de estas reglas al importar
// extractos: se aprenden solas de cada importación y corrección, y las manuales mandan.

const FLOW_LABELS = { OPERATING: 'Actividad', INVESTING: 'Inversión', FINANCING: 'Financiación', TAX: 'Impuestos', OTHER: 'Otro' };
const ORIGIN_FILTERS = [['ALL', 'Todas'], ['LEARNED', 'Aprendidas'], ['MANUAL', 'Manuales']];

const withCurrent = (options, current) => (current && !options.includes(current) ? [current, ...options] : options);

function emptyForm(options) {
    const business = options.businesses[0];
    return {
        merchant: '', pattern: '', destination: options.personal ? 'EXPENSE' : 'BUSINESS', direction: 'OUT',
        business_id: business ? String(business.id) : '', account_id: business?.accounts[0] ? String(business.accounts[0].id) : '',
        flow_type: 'OPERATING', category: '', subcategory: '', payment_method: '', expense_type: '', source: '',
    };
}

function formFromRule(rule) {
    return {
        merchant: rule.merchant_key || '', pattern: rule.pattern || '', destination: rule.destination, direction: rule.direction,
        business_id: rule.business_id ? String(rule.business_id) : '', account_id: rule.account_id ? String(rule.account_id) : '',
        flow_type: rule.flow_type || 'OPERATING', category: rule.category || '', subcategory: rule.subcategory || '',
        payment_method: rule.payment_method || '', expense_type: rule.expense_type || '', source: rule.source || '',
    };
}

function payload(form) {
    const base = { merchant: form.merchant, pattern: form.pattern, destination: form.destination };
    if (form.destination === 'BUSINESS') {
        return { ...base, direction: form.direction, business_id: Number(form.business_id) || null, account_id: Number(form.account_id) || null, flow_type: form.flow_type };
    }
    if (form.destination === 'INCOME') return { ...base, category: form.category, source: form.source };
    return { ...base, category: form.category, subcategory: form.subcategory, payment_method: form.payment_method, expense_type: form.expense_type };
}

function destinationText(rule) {
    if (rule.destination === 'EXPENSE') return { main: 'Gasto personal' };
    if (rule.destination === 'INCOME') return { main: 'Ingreso personal' };
    return {
        main: rule.business_name || 'Empresa',
        extra: [rule.account_name || 'Sin cuenta', rule.direction === 'OUT' ? 'pago' : 'cobro'].join(' · '),
    };
}

function classificationText(rule) {
    if (rule.destination === 'BUSINESS') return { main: FLOW_LABELS[rule.flow_type] || 'Actividad' };
    if (rule.destination === 'INCOME') return { main: rule.category, extra: rule.source ? `De ${rule.source}` : null };
    return {
        main: [rule.category, rule.subcategory].filter(Boolean).join(' › '),
        extra: [rule.payment_method, rule.expense_type].filter(Boolean).join(' · ') || null,
    };
}

function merchantLabel(rule) {
    return rule.merchant_key || `Contiene «${rule.pattern}»`;
}

export default function ReglasPage() {
    const id = useId();
    const { toast, confirm } = useFeedback();
    const [data, setData] = useState({ rules: [], personal: true, businesses: [], categories: { expense: [], income: [] }, paymentMethods: [] });
    const [status, setStatus] = useState({ loading: true, error: '' });
    const [query, setQuery] = useState('');
    const [origin, setOrigin] = useState('ALL');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(null);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setStatus({ loading: true, error: '' });
        try {
            setData(await requestJson('/api/classification-rules'));
            setStatus({ loading: false, error: '' });
        } catch (error) {
            if (silent) toast({ type: 'error', text: `No se ha podido actualizar la lista: ${error.message}`, action: { label: 'Recargar', onClick: () => window.location.reload() } });
            else setStatus({ loading: false, error: error.message });
        }
    }, [toast]);

    useEffect(() => {
        const timer = setTimeout(() => { void loadData(); }, 0);
        return () => clearTimeout(timer);
    }, [loadData]);

    const visible = useMemo(() => {
        const text = query.trim().toLowerCase();
        return data.rules.filter(rule => (origin === 'ALL' || rule.origin === origin) && (!text || [
            rule.merchant_key, rule.pattern, rule.example, rule.category, rule.subcategory, rule.source, rule.business_name, rule.account_name,
        ].some(value => value && value.toLowerCase().includes(text))));
    }, [data.rules, query, origin]);
    const manualCount = data.rules.filter(rule => rule.origin === 'MANUAL').length;

    const openForm = (rule = null) => {
        setEditing(rule ?? 'new');
        setForm(rule ? formFromRule(rule) : emptyForm(data));
        setErrors({});
        setFormError('');
    };
    const closeForm = () => { setEditing(null); setForm(null); };
    const update = (field, value) => {
        setForm(current => {
            const next = { ...current, [field]: value };
            // Al elegir otra empresa (o pasar a empresa), se propone su primera cuenta.
            if (field === 'destination' && value === 'BUSINESS' && !current.business_id && data.businesses[0]) next.business_id = String(data.businesses[0].id);
            if (field === 'business_id' || (field === 'destination' && value === 'BUSINESS' && !current.account_id)) {
                const business = data.businesses.find(item => String(item.id) === next.business_id);
                next.account_id = business?.accounts[0] ? String(business.accounts[0].id) : '';
            }
            return next;
        });
        setErrors(current => ({ ...current, [field]: undefined }));
    };

    const handleSave = async (event) => {
        event.preventDefault();
        const found = {};
        if (!form.merchant.trim() && !form.pattern.trim()) found.merchant = 'Escribe el comercio o el texto que debe contener el concepto';
        if (form.destination !== 'BUSINESS' && !form.category.trim()) found.category = 'Indica la categoría';
        if (form.destination === 'BUSINESS' && !form.account_id) found.account_id = 'Elige la cuenta de la empresa';
        setErrors(found);
        if (Object.keys(found).length) {
            document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus();
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            const isNew = editing === 'new';
            const saved = await requestJson('/api/classification-rules', jsonRequest(isNew ? 'POST' : 'PUT', isNew ? payload(form) : { ...payload(form), id: editing.id }));
            toast({ text: isNew ? `Regla de «${merchantLabel(saved)}» creada` : `Regla de «${merchantLabel(saved)}» guardada` });
            closeForm();
            await loadData({ silent: true });
        } catch (error) {
            setFormError(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (rule) => {
        const ok = await confirm({
            title: 'Eliminar regla',
            text: rule.origin === 'LEARNED'
                ? `Se eliminará la regla de «${merchantLabel(rule)}». Se volverá a aprender cuando importes o corrijas un movimiento de ese comercio.`
                : `Se eliminará la regla manual de «${merchantLabel(rule)}».`,
            confirmLabel: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            await requestJson(`/api/classification-rules?id=${rule.id}`, { method: 'DELETE' });
            setData(current => ({ ...current, rules: current.rules.filter(item => item.id !== rule.id) }));
            toast({ text: `Regla de «${merchantLabel(rule)}» eliminada` });
        } catch (error) {
            toast({ type: 'error', text: error.message });
        }
    };

    const header = (
        <div className="page-header">
            <h1 className="page-title">Reglas de clasificación</h1>
            <p className="page-subtitle">Cómo clasifica la IA cada movimiento al importar tus extractos: a dónde va y con qué categoría</p>
        </div>
    );

    if (status.loading || status.error) {
        return (
            <div className="page-container">
                {header}
                <LoadState loading={status.loading} error={status.error} onRetry={() => loadData()} label="Cargando tus reglas…" />
            </div>
        );
    }

    const canCreate = data.personal || data.businesses.length > 0;
    const business = form ? data.businesses.find(item => String(item.id) === form.business_id) : null;
    const categories = form?.destination === 'INCOME' ? data.categories.income : data.categories.expense;
    const describe = field => (errors[field] ? `${id}-${field}-error` : undefined);

    return (
        <div className="page-container">
            {header}

            <section className="card" aria-labelledby="reglas-lista-titulo">
                <div className={`card-header ${styles.headerRow}`}>
                    <h2 id="reglas-lista-titulo">Tus reglas ({data.rules.length})</h2>
                    {canCreate && <button type="button" className="btn btn-primary" onClick={() => openForm()}>Nueva regla</button>}
                </div>
                <div className="card-body">
                    {data.rules.length === 0 ? (
                        <EmptyState
                            title="Todavía no hay reglas"
                            text="Se crean solas cuando importas extractos con la IA o corriges la categoría de un movimiento. También puedes crear las tuyas."
                        />
                    ) : (
                        <>
                            <div className={styles.toolbar}>
                                <Field label="Buscar" htmlFor={`${id}-buscar`} className={styles.search}>
                                    <input id={`${id}-buscar`} type="search" className="form-input" placeholder="Comercio o categoría" value={query} onChange={event => setQuery(event.target.value)} />
                                </Field>
                                <Field label="Origen" htmlFor={`${id}-origen`} className={styles.filter}>
                                    <select id={`${id}-origen`} className="form-input form-select" value={origin} onChange={event => setOrigin(event.target.value)}>
                                        {ORIGIN_FILTERS.map(([value, label]) => (
                                            <option key={value} value={value}>{label}{value === 'MANUAL' ? ` (${manualCount})` : value === 'LEARNED' ? ` (${data.rules.length - manualCount})` : ''}</option>
                                        ))}
                                    </select>
                                </Field>
                            </div>

                            {visible.length === 0 ? (
                                <EmptyState title="Ninguna regla coincide" text="Prueba con otro texto u origen." />
                            ) : (
                                <div className="table-container">
                                    <table className="table table-stack">
                                        <caption><VisuallyHidden>Reglas de clasificación: comercio, a dónde va, categoría, origen y uso</VisuallyHidden></caption>
                                        <thead>
                                            <tr>
                                                <th scope="col">Comercio</th>
                                                <th scope="col">A dónde va</th>
                                                <th scope="col">Categoría</th>
                                                <th scope="col">Origen</th>
                                                <th scope="col">Veces usada</th>
                                                <th scope="col">Último uso</th>
                                                <th scope="col"><VisuallyHidden>Acciones</VisuallyHidden></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visible.map(rule => {
                                                const where = destinationText(rule);
                                                const what = classificationText(rule);
                                                return (
                                                    <tr key={rule.id}>
                                                        <th scope="row" data-label="Comercio">
                                                            <span className={styles.merchant}>{merchantLabel(rule)}</span>
                                                            {rule.merchant_key && rule.pattern && <span className={styles.secondary}>Si contiene «{rule.pattern}»</span>}
                                                            {rule.example && <span className={styles.secondary}>{rule.example}</span>}
                                                        </th>
                                                        <td data-label="A dónde va">
                                                            {where.main}
                                                            {where.extra && <span className={styles.secondary}>{where.extra}</span>}
                                                        </td>
                                                        <td data-label="Categoría">
                                                            {what.main || '—'}
                                                            {what.extra && <span className={styles.secondary}>{what.extra}</span>}
                                                        </td>
                                                        <td data-label="Origen">
                                                            <span className={`badge ${rule.origin === 'MANUAL' ? 'badge-primary' : styles.learned}`}>{rule.origin === 'MANUAL' ? 'Manual' : 'Aprendida'}</span>
                                                        </td>
                                                        <td data-label="Veces usada" className={styles.numeric}>{rule.hits}</td>
                                                        <td data-label="Último uso">{rule.last_used_at ? formatDateTime(rule.last_used_at) : 'Nunca'}</td>
                                                        <td data-label="Acciones">
                                                            <div className={styles.actions}>
                                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm(rule)} aria-label={`Editar la regla de ${merchantLabel(rule)}`}>Editar</button>
                                                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(rule)} aria-label={`Eliminar la regla de ${merchantLabel(rule)}`}>Eliminar</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            <p className="alert alert-info mt-lg">
                Cada vez que importas un extracto con la IA o corriges la categoría, subcategoría o método de pago de un movimiento,
                la regla de ese comercio se crea o se actualiza. Las reglas manuales (las que creas o editas aquí) mandan:
                el aprendizaje no las cambia.
            </p>

            <Modal
                open={Boolean(form)}
                onClose={closeForm}
                title={editing === 'new' ? 'Nueva regla' : 'Editar regla'}
                footer={<>
                    <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
                    <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar regla'}</button>
                </>}
            >
                {form && (
                    <form id={`${id}-form`} onSubmit={handleSave} noValidate>
                        {editing !== 'new' && editing?.origin === 'LEARNED' && (
                            <p className="alert alert-info">Al guardarla pasa a ser manual: el aprendizaje ya no la cambiará.</p>
                        )}
                        <Field label="Comercio" htmlFor={`${id}-merchant`} error={errors.merchant} hint="Como aparece en el banco, por ejemplo «Mercadona» o «COMPRA TARJ MERCADONA VALENCIA».">
                            <input
                                id={`${id}-merchant`} type="text" className="form-input" maxLength={240} autoComplete="off" data-autofocus
                                value={form.merchant} onChange={event => update('merchant', event.target.value)}
                                aria-invalid={errors.merchant ? true : undefined} aria-describedby={describe('merchant') || `${id}-merchant-ayuda`}
                            />
                        </Field>
                        <Field label="Solo si el concepto contiene (opcional)" htmlFor={`${id}-pattern`} hint="Por ejemplo, «bizum juan». Sin comercio, vale para cualquier concepto con ese texto.">
                            <input id={`${id}-pattern`} type="text" className="form-input" maxLength={120} autoComplete="off" value={form.pattern} onChange={event => update('pattern', event.target.value)} aria-describedby={`${id}-pattern-ayuda`} />
                        </Field>
                        <Field label="A dónde va" htmlFor={`${id}-destination`}>
                            <select id={`${id}-destination`} className="form-input form-select" value={form.destination} onChange={event => update('destination', event.target.value)}>
                                {data.personal && <option value="EXPENSE">Gasto personal</option>}
                                {data.personal && <option value="INCOME">Ingreso personal</option>}
                                {data.businesses.length > 0 && <option value="BUSINESS">Movimiento de empresa</option>}
                            </select>
                        </Field>

                        {form.destination === 'BUSINESS' ? (
                            <>
                                <div className={styles.pair}>
                                    <Field label="Empresa" htmlFor={`${id}-business_id`}>
                                        <select id={`${id}-business_id`} className="form-input form-select" value={form.business_id} onChange={event => update('business_id', event.target.value)}>
                                            {data.businesses.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Cuenta" htmlFor={`${id}-account_id`} error={errors.account_id}>
                                        <select
                                            id={`${id}-account_id`} className="form-input form-select" value={form.account_id} onChange={event => update('account_id', event.target.value)}
                                            aria-invalid={errors.account_id ? true : undefined} aria-describedby={describe('account_id')}
                                        >
                                            {!business?.accounts.length && <option value="">Esta empresa no tiene cuentas</option>}
                                            {business?.accounts.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <div className={styles.pair}>
                                    <Field label="Sentido" htmlFor={`${id}-direction`}>
                                        <select id={`${id}-direction`} className="form-input form-select" value={form.direction} onChange={event => update('direction', event.target.value)}>
                                            <option value="OUT">Sale dinero (pago)</option>
                                            <option value="IN">Entra dinero (cobro)</option>
                                        </select>
                                    </Field>
                                    <Field label="Tipo de flujo" htmlFor={`${id}-flow_type`}>
                                        <select id={`${id}-flow_type`} className="form-input form-select" value={form.flow_type} onChange={event => update('flow_type', event.target.value)}>
                                            {Object.entries(FLOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                    </Field>
                                </div>
                            </>
                        ) : (
                            <>
                                <Field label="Categoría" htmlFor={`${id}-category`} error={errors.category}>
                                    <input
                                        id={`${id}-category`} type="text" className="form-input" maxLength={100} autoComplete="off" list={`${id}-categories`}
                                        value={form.category} onChange={event => update('category', event.target.value)}
                                        aria-invalid={errors.category ? true : undefined} aria-describedby={describe('category')}
                                    />
                                    <datalist id={`${id}-categories`}>
                                        {categories.map(name => <option key={name} value={name} />)}
                                    </datalist>
                                </Field>
                                {form.destination === 'EXPENSE' ? (
                                    <>
                                        <Field label="Subcategoría (opcional)" htmlFor={`${id}-subcategory`}>
                                            <input id={`${id}-subcategory`} type="text" className="form-input" maxLength={100} autoComplete="off" value={form.subcategory} onChange={event => update('subcategory', event.target.value)} />
                                        </Field>
                                        <div className={styles.pair}>
                                            <Field label="Método de pago" htmlFor={`${id}-payment_method`}>
                                                <select id={`${id}-payment_method`} className="form-input form-select" value={form.payment_method} onChange={event => update('payment_method', event.target.value)}>
                                                    <option value="">Sin indicar</option>
                                                    {withCurrent([...new Set([...PAYMENT_METHODS, ...data.paymentMethods])], form.payment_method).map(option => <option key={option} value={option}>{option}</option>)}
                                                </select>
                                            </Field>
                                            <Field label="Tipo de gasto" htmlFor={`${id}-expense_type`}>
                                                <select id={`${id}-expense_type`} className="form-input form-select" value={form.expense_type} onChange={event => update('expense_type', event.target.value)}>
                                                    <option value="">Sin indicar</option>
                                                    {withCurrent(EXPENSE_TYPES, form.expense_type).map(option => <option key={option} value={option}>{option}</option>)}
                                                </select>
                                            </Field>
                                        </div>
                                    </>
                                ) : (
                                    <Field label="Fuente (opcional)" htmlFor={`${id}-source`}>
                                        <input id={`${id}-source`} type="text" className="form-input" maxLength={150} autoComplete="off" placeholder="Por ejemplo, Empresa ABC" value={form.source} onChange={event => update('source', event.target.value)} />
                                    </Field>
                                )}
                            </>
                        )}
                        {formError && <p className="alert alert-danger" role="alert">{formError}</p>}
                    </form>
                )}
            </Modal>
        </div>
    );
}
