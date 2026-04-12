/** Strip whitespace and common `.env` wrapping quotes from secrets. */
export function trimSecretEnv(raw: string | undefined | null): string {
    if (raw == null) return '';
    return String(raw).trim().replace(/^['"]+|['"]+$/g, '');
}
