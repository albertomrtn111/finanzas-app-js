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
        // Remove extra spaces and split off any time component (e.g., "DD/MM/YYYY HH:mm")
        // Taking the first part assumes dates are at the start.
        // If format is YYYY-MM-DDTHH:mm... (ISO), splitting by space might keep it intact if no space, 
        // but let's handle the split carefully. 
        // actually for ISO "T" is the separator.
        // Let's just trim first.
        let v = value.trim();

        // Use a simpler approach: extract the date part if it matches expected patterns

        // ISO-like: YYYY-MM-DD (start of string)
        const isoMatch = v.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) {
            const d = new Date(isoMatch[1]);
            return isValidDate(d) ? d : null;
        }

        // EU-like: DD/MM/YYYY
        // Catch "23/10/2025" from "23/10/2025 10:00"
        const euMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (euMatch) {
            const [_, dd, mm, yyyy] = euMatch;
            const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
            return isValidDate(d) ? d : null;
        }

        // Fallback for other string formats
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
