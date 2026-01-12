// Utilidades generales

/**
 * Formatea un número como moneda (euros)
 */
export function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

/**
 * Formatea un porcentaje
 */
export function formatPercent(value, decimals = 1) {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Formatea una fecha
 */
export function formatDate(date) {
    return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(date));
}

/**
 * Formatea fecha corta
 */
export function formatDateShort(date) {
    return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date));
}

/**
 * Nombres de meses en español
 */
export const monthNames = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

/**
 * Obtiene el año actual
 */
export function getCurrentYear() {
    return new Date().getFullYear();
}

/**
 * Obtiene el mes actual (1-12)
 */
export function getCurrentMonth() {
    return new Date().getMonth() + 1;
}

/**
 * Clase cn para combinar clases CSS
 */
export function cn(...classes) {
    return classes.filter(Boolean).join(' ');
}
