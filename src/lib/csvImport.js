// Parses the comma or semicolon separated files produced by banks and by this app.
export function parseCSV(text) {
    if (typeof text !== 'string') return [];
    const source = text.replace(/^\uFEFF/, '');
    const firstLine = source.split(/\r?\n/, 1)[0] || '';
    const separator = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const records = [];
    let row = [];
    let field = '';
    let quoted = false;
    let line = 1;
    let rowLine = 1;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '"') {
            if (quoted && source[i + 1] === '"') {
                field += '"';
                i++;
            } else if (!quoted && field.trim() !== '') {
                field += char;
            } else {
                quoted = !quoted;
            }
        } else if (char === separator && !quoted) {
            row.push(field.trim());
            field = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && source[i + 1] === '\n') i++;
            row.push(field.trim());
            if (row.some(value => value !== '')) records.push({ values: row, line: rowLine });
            field = '';
            row = [];
            line++;
            rowLine = line;
        } else {
            field += char;
            if (char === '\n') line++;
        }
    }
    if (quoted) throw new Error('El CSV contiene comillas sin cerrar');
    row.push(field.trim());
    if (row.some(value => value !== '')) records.push({ values: row, line: rowLine });
    if (records.length < 2) return [];

    const headers = records[0].values.map(header => header.trim().toLowerCase());
    if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
        throw new Error('Las cabeceras del CSV están vacías o duplicadas');
    }
    return records.slice(1).map(({ values, line: rowNum }) => {
        const result = { _rowNum: rowNum };
        headers.forEach((header, index) => { result[header] = values[index] ?? ''; });
        if (values.length !== headers.length) result._columnError = true;
        return result;
    });
}

export function normalizeImportDate(value) {
    if (typeof value !== 'string') return null;
    const date = value.trim().split(/[ T]/)[0];
    let year; let month; let day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        [year, month, day] = date.split('-').map(Number);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
        [day, month, year] = date.split('/').map(Number);
    } else {
        return null;
    }
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2100 || parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeImportAmount(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    let raw = String(value).trim().replace(/\s/g, '');
    if (raw.includes(',') && raw.includes('.')) {
        raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
            ? raw.replace(/\./g, '').replace(',', '.')
            : raw.replace(/,/g, '');
    } else if (raw.includes(',')) {
        raw = raw.replace(',', '.');
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
    const amount = Number(raw);
    return Number.isFinite(amount) && amount > 0 && amount <= 9999999999.99 ? amount : null;
}
