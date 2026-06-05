/**
 * South African mobile number helpers.
 *
 * Numbers are stored normalised to the 27XXXXXXXXX form (no leading +), matching
 * the shape already used for WhatsApp deeplinks in
 * `lib/providers/notify-contractor-of-lead.ts`. Capture is lenient about input
 * formatting (spaces, dashes, +, leading 0) but strict about the result being a
 * plausible SA mobile.
 */

/**
 * Normalise a raw SA number to `27XXXXXXXXX`. Returns null if it cannot be
 * coerced into a plausible South African number.
 */
export function normalizeSaPhone(raw: string): string | null {
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return null;

    // 0XXXXXXXXX (local) -> 27XXXXXXXXX
    if (digits.length === 10 && digits.startsWith('0')) {
        return `27${digits.slice(1)}`;
    }
    // 27XXXXXXXXX (already international, 11 digits)
    if (digits.length === 11 && digits.startsWith('27')) {
        return digits;
    }
    // XXXXXXXXX (9 digits, missing the leading 0) -> assume SA
    if (digits.length === 9) {
        return `27${digits}`;
    }
    return null;
}

/**
 * True when the value normalises to a plausible SA mobile. SA mobile numbers
 * begin with 06, 07, or 08 (i.e. 276/277/278 in international form).
 */
export function isValidSaMobile(raw: string): boolean {
    const normalized = normalizeSaPhone(raw);
    if (!normalized) return false;
    return /^27[678]\d{8}$/.test(normalized);
}

/** Display a stored 27XXXXXXXXX number as 0XX XXX XXXX for the UI. */
export function formatSaPhoneLocal(normalized: string): string {
    if (!/^27\d{9}$/.test(normalized)) return normalized;
    const local = `0${normalized.slice(2)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/**
 * Format a partial number as the user types, into the familiar SA local style
 * (0XX XXX XXXX). Mirrors the Pro Network onboarding input. Drops +27/0 prefixes,
 * caps at 9 national digits, and groups them. Storage still normalises to 27...
 */
export function formatSaPhoneInput(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('27')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 9);
    if (!digits) return '';
    const a = digits.slice(0, 2);
    const b = digits.slice(2, 5);
    const c = digits.slice(5, 9);
    return [`0${a}`, b, c].filter(Boolean).join(' ');
}
