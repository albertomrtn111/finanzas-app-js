// Formulario único de gasto e ingreso (Tarea NF-17): valores iniciales, validación con importes
// al estilo español («12,50») y datos listos para /api/expenses y /api/income. Sin React para
// poder probarlo; las pruebas de extremo a extremo lo usan para normalizar los importes.
import { amountToInput, parseAmountInput } from './amount.js';
import { parseDate } from './apiValidation.js';
import { formatEuro } from './moneyFormat.js';

export const PAYMENT_METHODS = ['Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro'];
export const EXPENSE_TYPES = ['Variable', 'Fijo'];
export const NEW_CATEGORY = '__nueva__';

export const KIND_TEXT = {
    expense: { one: 'gasto', many: 'gastos', title: 'Gasto' },
    income: { one: 'ingreso', many: 'ingresos', title: 'Ingreso' },
};

// Un solo estado para los dos tipos: al cambiar de gasto a ingreso no se pierde lo escrito.
export function emptyMovementForm({ today, category = '' } = {}) {
    return {
        date: today || '',
        amount: '',
        category,
        newCategory: '',
        subcategory: '',
        payment_method: 'Tarjeta',
        expense_type: 'Variable',
        source: '',
        notes: '',
    };
}

// Registro guardado (respuesta de la API) → valores del formulario para editarlo.
export function formFromRecord(record) {
    return {
        date: String(record?.date ?? '').slice(0, 10),
        amount: amountToInput(record?.amount),
        category: record?.category ?? '',
        newCategory: '',
        subcategory: record?.subcategory ?? '',
        payment_method: record?.payment_method ?? '',
        expense_type: record?.expense_type ?? '',
        source: record?.source ?? '',
        notes: record?.notes ?? '',
    };
}

const text = value => String(value ?? '').trim();

// Valores del formulario → { value } con el cuerpo para la API o { errors } por campo, en español.
export function movementPayload(kind, form) {
    const errors = {};
    const amount = parseAmountInput(form?.amount);
    if (amount.error) errors.amount = amount.error;
    if (!parseDate(form?.date)) errors.date = 'Elige una fecha válida';
    const category = text(form?.category);
    if (!category || category === NEW_CATEGORY) errors.category = 'Elige una categoría';
    else if (category.length > 100) errors.category = 'La categoría no puede superar 100 caracteres';
    if (kind === 'expense' && text(form?.subcategory).length > 100) errors.subcategory = 'La subcategoría no puede superar 100 caracteres';
    if (kind === 'income' && text(form?.source).length > 150) errors.source = 'La fuente no puede superar 150 caracteres';
    if (text(form?.notes).length > 10000) errors.notes = 'Las notas no pueden superar 10.000 caracteres';
    if (Object.keys(errors).length) return { errors };

    const base = { date: form.date, amount: amount.value, category, notes: text(form.notes) || null };
    if (kind === 'income') return { value: { ...base, source: text(form.source) || null } };
    return {
        value: {
            ...base,
            subcategory: text(form.subcategory) || null,
            payment_method: text(form.payment_method) || null,
            expense_type: text(form.expense_type) || null,
        },
    };
}

// Registro guardado → cuerpo para volver a crearlo o restaurarlo («Deshacer»).
export function recordToPayload(kind, record) {
    const base = {
        date: String(record.date).slice(0, 10),
        amount: Number(record.amount).toFixed(2),
        category: record.category,
        notes: record.notes ?? null,
    };
    if (kind === 'income') return { ...base, source: record.source ?? null };
    return { ...base, subcategory: record.subcategory ?? null, payment_method: record.payment_method ?? null, expense_type: record.expense_type ?? null };
}

// Compara nombres de categoría sin mayúsculas, tildes ni espacios sobrantes.
const normalize = name => text(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Categoría existente con ese nombre (aunque se escriba «supermercado» o «Supermércado»), o null.
export function findCategory(categories, name) {
    const wanted = normalize(name);
    if (!wanted) return null;
    return categories.find(category => normalize(category.name) === wanted)?.name ?? null;
}

// Categoría inicial: la última usada si sigue existiendo; si no, la primera.
export function pickCategory(categories, remembered) {
    return (remembered && findCategory(categories, remembered)) || categories[0]?.name || '';
}

// «12,50 € en Supermercado»
export function movementSummary(record) {
    return `${formatEuro(record.amount)} en ${record.category}`;
}
