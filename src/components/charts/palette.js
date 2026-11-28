// Colores de los gráficos por su papel (Tarea NF-20). Los valores están en charts.module.css (.frame),
// con su versión para modo oscuro; aquí solo se nombran para que cada serie tenga siempre el mismo color.

// Categorías: posición 1 a 6 de la paleta neutra; el resto, «Otras».
export const slot = n => `var(--chart-${n})`;
export const OTHER = 'var(--chart-other)';

// Series fijas: el mismo concepto tiene el mismo color en todas las páginas.
export const SERIES = {
    investments: slot(1),
    cash: slot(2),
    value: slot(1),
    contributed: 'var(--chart-reference)',
};

// Rojo y verde solo con significado: bueno (ahorro positivo) o malo (negativo).
export const GOOD = 'var(--success)';
export const BAD = 'var(--danger)';
