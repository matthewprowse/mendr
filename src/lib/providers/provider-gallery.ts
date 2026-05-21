/**
 * Shared gallery source-label utility for contractor profile pages.
 * Single source of truth — previously duplicated across /pro and /contractors.
 *
 * Google-synced photos use `source` "google" (or legacy rows where the storage
 * path is `providers/{id}/{file}`). User uploads use `source` "user" and path
 * `providers/{id}/user/...` (see gallery API).
 */
export function galleryImageSourceLabel(
    source: string | null | undefined,
    storagePath: string | null | undefined,
): 'Google' | 'Menda' {
    const s = String(source ?? '')
        .trim()
        .toLowerCase();
    if (s === 'google' || s === 'website') return 'Google';
    if (s === 'user') return 'Menda';

    const path = String(storagePath ?? '')
        .replace(/\\/g, '/')
        .toLowerCase();
    if (path.includes('/user/')) return 'Menda';
    if (path.length > 0) return 'Google';
    return 'Menda';
}
