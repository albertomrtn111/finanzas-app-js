'use client';

import styles from './ui.module.css';

// Importe en un campo de texto: acepta coma decimal («12,50»), no cambia con la rueda del ratón y
// en el móvil abre el teclado numérico. El valor es el texto tal cual; valídalo con parseAmountInput.
export default function AmountInput({ id, value, onChange, className = '', placeholder = '0,00', ...props }) {
    return (
        <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={`form-input ${styles.amount} ${className}`.trim()}
            placeholder={placeholder}
            value={value}
            onChange={event => onChange(event.target.value)}
            {...props}
        />
    );
}
