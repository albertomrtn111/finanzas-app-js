// Importes que escribe el usuario, al estilo español: «12,50», «1.234,56», «12.5», «1234», «-20».
// Devuelve { value: '1234.56' } (texto con punto y dos decimales, lo que esperan las APIs)
// o { error } con un mensaje en español.
export function parseAmountInput(input, { allowNegative = false, allowZero = false, label = 'El importe' } = {}) {
    let text = String(input ?? '').replace(/[\s €]/g, '');
    if (!text) return { error: `${label} es obligatorio` };
    let negative = false;
    if (text.startsWith('-')) { negative = true; text = text.slice(1); }
    else if (text.startsWith('+')) text = text.slice(1);
    if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return { error: `${label} no es un número válido` };

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let whole = text;
    let fraction = '';
    if (lastComma >= 0 && lastDot >= 0) {
        // Los dos separadores: el último es el decimal y el otro separa miles.
        const decimal = lastComma > lastDot ? ',' : '.';
        const thousands = decimal === ',' ? '.' : ',';
        const at = text.lastIndexOf(decimal);
        whole = text.slice(0, at);
        fraction = text.slice(at + 1);
        if (whole.includes(decimal) || !validThousands(whole, thousands)) return { error: `${label} no es un número válido` };
        whole = whole.split(thousands).join('');
    } else if (lastComma >= 0) {
        if (text.indexOf(',') !== lastComma) return { error: `${label} no es un número válido` };
        [whole, fraction] = text.split(',');
    } else if (lastDot >= 0) {
        const dots = text.split('.').length - 1;
        const after = text.slice(lastDot + 1);
        // «1.234» o «1.234.567» son miles; «12.5» o «12.50» son decimales.
        if (dots > 1 || (after.length === 3 && lastDot > 0)) {
            if (!validThousands(text, '.')) return { error: `${label} no es un número válido` };
            whole = text.split('.').join('');
        } else {
            [whole, fraction] = text.split('.');
        }
    }
    if (fraction.length > 2) return { error: `${label} admite como mucho dos decimales` };
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (!whole && !fraction)) return { error: `${label} no es un número válido` };

    const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
    if (!Number.isSafeInteger(cents) || cents > 999999999999) return { error: `${label} es demasiado grande` };
    if (negative && !allowNegative) return { error: `${label} no puede ser negativo` };
    if (cents === 0 && !allowZero) return { error: `${label} tiene que ser mayor que 0` };
    const sign = negative && cents ? '-' : '';
    return { value: `${sign}${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` };
}

function validThousands(text, separator) {
    const groups = text.split(separator);
    return groups[0].length >= 1 && groups[0].length <= 3 && groups.slice(1).every(group => group.length === 3);
}

// Importe guardado (número o texto con punto) para mostrarlo en un campo: «12,5» → «12,50».
export function amountToInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toFixed(2).replace('.', ',');
}
