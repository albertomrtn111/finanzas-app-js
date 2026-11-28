// Formatos de los gráficos en español (Tarea NF-20). Las fechas siguen src/lib/dateFormat.js
// («24 nov 2026»); los meses llegan como AAAA-MM.
import { formatCompactEuro } from '@/lib/moneyFormat';
import { formatDate } from '@/lib/dateFormat';

const fmt = options => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', ...options });
const SHORT = fmt({ month: 'short' });
const LONG = fmt({ month: 'long', year: 'numeric' });
const asDate = month => new Date(`${month}-01T00:00:00.000Z`);

// «nov»
export function formatMonthShort(month) {
    return SHORT.format(asDate(month)).replace('.', '');
}

// «nov 2026»
export function formatMonthYear(month) {
    return `${formatMonthShort(month)} ${month.slice(0, 4)}`;
}

// «noviembre de 2026»
export function formatMonthLong(month) {
    return LONG.format(asDate(month));
}

// Ejes de importes: «850 €», «1,2 mil €», «1,5 M€». Nunca «0k».
export const formatAxisEuro = formatCompactEuro;

export { formatDate };
