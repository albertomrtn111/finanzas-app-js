const MONEY_LIMIT = 9999999999.99;

export function parseId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parsePagination(searchParams) {
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    if (rawLimit === null && rawOffset === null) return { value: {} };
    const limit = Number(rawLimit);
    const offset = Number(rawOffset ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        !Number.isSafeInteger(offset) || offset < 0) {
        return { error: 'Paginación inválida (limit: 1-500; offset: 0 o mayor)' };
    }
    return { value: { take: limit, skip: offset } };
}

export function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date : null;
}

function requiredText(value, label, maxLength) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
        throw new Error(`${label} debe tener entre 1 y ${maxLength} caracteres`);
    }
    return value.trim();
}

function optionalText(value, label, maxLength) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > maxLength) {
        throw new Error(`${label} no puede superar ${maxLength} caracteres`);
    }
    return value.trim() || null;
}

function money(value, label, allowNegative = false, allowZero = false) {
    const raw = typeof value === 'number' ? String(value) : value;
    if (typeof raw !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
        throw new Error(`${label} debe ser un importe válido con hasta dos decimales`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number) || Math.abs(number) > MONEY_LIMIT ||
        (!allowNegative && number < 0) || (!allowZero && number === 0)) {
        throw new Error(`${label} está fuera del rango permitido`);
    }
    return raw;
}

export function parseFinancialRecord(kind, input) {
    try {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new Error('Datos inválidos');
        }
        const date = parseDate(input.date);
        if (!date) throw new Error('La fecha debe tener el formato AAAA-MM-DD y ser válida');
        if (kind === 'expense') {
            return { value: {
                date,
                amount: money(input.amount, 'El importe'),
                category: requiredText(input.category, 'La categoría', 100),
                subcategory: optionalText(input.subcategory, 'La subcategoría', 100),
                payment_method: optionalText(input.payment_method, 'El método de pago', 50),
                expense_type: optionalText(input.expense_type, 'El tipo de gasto', 50),
                notes: optionalText(input.notes, 'Las notas', 10000),
            } };
        }
        if (kind === 'income') {
            return { value: {
                date,
                amount: money(input.amount, 'El importe'),
                category: requiredText(input.category, 'La categoría', 100),
                source: optionalText(input.source, 'La fuente', 150),
                notes: optionalText(input.notes, 'Las notas', 10000),
            } };
        }
        if (kind === 'cash') {
            return { value: {
                date,
                account: requiredText(input.account, 'La cuenta', 150),
                current_value: money(input.current_value, 'El saldo', true, true),
                notes: optionalText(input.notes, 'Las notas', 10000),
            } };
        }
        if (kind === 'investment') {
            return { value: {
                date,
                account: requiredText(input.account, 'El producto', 150),
                asset_type: requiredText(input.asset_type, 'El tipo de activo', 100),
                contribution: money(input.contribution, 'La aportación', true, true),
                current_value: money(input.current_value, 'El valor actual', false, true),
                notes: optionalText(input.notes, 'Las notas', 10000),
            } };
        }
        throw new Error('Tipo de registro inválido');
    } catch (error) {
        return { error: error.message };
    }
}
