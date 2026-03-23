/**
 * Google-synced photos use `source` google (or legacy rows with storage path `providers/{id}/{file}`).
 * User uploads use `source` user and path `providers/{id}/user/...` (see gallery API).
 */
export function galleryImageSourceLabel(
    source: string | null | undefined,
    storagePath: string | null | undefined
): 'Google' | 'Scandio' {
    const s = String(source ?? '')
        .trim()
        .toLowerCase();
    if (s === 'google' || s === 'website') return 'Google';
    if (s === 'user') return 'Scandio';

    const path = String(storagePath ?? '')
        .replace(/\\/g, '/')
        .toLowerCase();
    if (path.includes('/user/')) return 'Scandio';
    if (path.length > 0) return 'Google';
    return 'Scandio';
}
