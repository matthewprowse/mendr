/**
 * Shared review formatting utilities used by contractor profile pages.
 * Single source of truth — previously duplicated across /pro and /contractors.
 */

export function getInitials(fullName: string): string {
    const parts = fullName
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const firstTwo = parts.slice(0, 2);
    return firstTwo
        .map((p) => p.slice(0, 1).toUpperCase())
        .join('');
}

export function formatReviewDateLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
