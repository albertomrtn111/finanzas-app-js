// Formatos de importes en español para la interfaz.

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const compact = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });

export function formatEuro(amount) {
    return euro.format(Number(amount) || 0);
}

// Formato corto para ejes de gráficos: «850 €», «1,2 mil €», «-15 mil €», «1,5 M€».
// Usa espacios de no separación, como Intl, para que no se partan en dos líneas.
export function formatCompactEuro(amount) {
    const text = compact.format(Number(amount) || 0);
    return text.endsWith(' M') ? `${text}€` : `${text} €`;
}

// Porcentaje en español: «41,5 %».
export function formatPct(value, maximumFractionDigits = 1) {
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits }).format(Number(value) || 0)} %`;
}

// Variación con signo: «+12,5 %» o «-3 %».
export function formatSignedPct(value) {
    const text = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(value));
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${text} %`;
}

// Diferencia en euros con signo: «+350,00 €» o «-20,50 €».
export function formatSignedEuro(value) {
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${euro.format(Math.abs(value))}`;
}
