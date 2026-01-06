
/**
 * Universal date formatter that ensures DD/MM/YYYY is returned for display
 */
export const formatDate = (dateStr?: string | Date) => {
    if (!dateStr) return '-';

    // If it's already in DD/MM/YYYY format
    if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return typeof dateStr === 'string' ? dateStr : '-';

    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

/**
 * Universal date parser that handles YYYY-MM-DD, DD/MM/YYYY, and MM/DD/YYYY
 * Returns YYYY-MM-DD for storage consistency (ISO-ish)
 */
export const parseSafeDate = (input: string | undefined | null): string => {
    if (!input) return '';

    // 1. If already ISO-like (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.split('T')[0];

    // 2. Handle DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
    const parts = input.split(/[\/\-\.\s]/).filter(p => p.length > 0);
    if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) { // YYYY/MM/DD
            [year, month, day] = parts;
        } else if (parts[2].length === 4) { // DD/MM/YYYY or MM/DD/YYYY
            const p0 = parseInt(parts[0], 10);
            const p1 = parseInt(parts[1], 10);
            const p2 = parts[2];

            if (p0 > 12) { // Must be DD/MM/YYYY
                day = p0;
                month = p1;
                year = p2;
            } else if (p1 > 12) { // Must be MM/DD/YYYY
                month = p0;
                day = p1;
                year = p2;
            } else {
                // Ambiguous (both <= 12). Default to DD/MM/YYYY as requested by user.
                day = p0;
                month = p1;
                year = p2;
            }
        } else {
            // Unknown format with 3 parts, fallback to native
            const d = new Date(input);
            return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
        }

        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // Fallback to native
    const d = new Date(input);
    return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
};

/**
 * Utility to check if a date string is in YYYY-MM-DD format
 */
export const isValidISODate = (date: string) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
};
