/**
 * Checks if a date object is valid
 */
export function isValidDate(d) {
    return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Robustly parses a date from various formats
 * Supports:
 * - Date objects
 * - ISO strings (YYYY-MM-DD)
 * - EU strings (DD/MM/YYYY)
 * - Standard string constructor fallback
 */
export function parseAppDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isValidDate(value) ? value : null;

    if (typeof value === "string") {
        const v = value.trim();

        // ISO: 2025-10-23 or 2025-10-23T...
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
            const d = new Date(v);
            return isValidDate(d) ? d : null;
        }

        // EU: DD/MM/YYYY or D/M/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
            const [dd, mm, yyyy] = v.split("/");
            const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
            return isValidDate(d) ? d : null;
        }

        // fallback
        const d = new Date(v);
        return isValidDate(d) ? d : null;
    }

    // fallback non-string
    try {
        const d = new Date(value);
        return isValidDate(d) ? d : null;
    } catch {
        return null;
    }
}
