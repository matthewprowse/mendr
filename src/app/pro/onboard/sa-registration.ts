/** CIPC-style enterprise registration: `YYYY/######/##` (4 / 6 / 2 digits). */

const MAX_DIGITS = 12;

export function formatSaRegistrationInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS);
    if (digits.length <= 4) return digits;
    if (digits.length <= 10) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
    return `${digits.slice(0, 4)}/${digits.slice(4, 10)}/${digits.slice(10, 12)}`;
}

export function isValidSaRegistrationNumber(value: string): boolean {
    const digitsOnly = value.replace(/\D/g, '');
    if (!/^\d{12}$/.test(digitsOnly)) return false;
    const year = parseInt(digitsOnly.slice(0, 4), 10);
    const y = new Date().getFullYear();
    if (year < 1800 || year > y + 1) return false;
    return true;
}

export function registrationNumberPlaceholder(): string {
    const y = new Date().getFullYear();
    return `${y}/000000/00`;
}
