import { setOptions } from '@googlemaps/js-api-loader';

const GLOBAL_FLAG = '__scandioGoogleMapsLoaderOptionsSet' as const;

/**
 * Ensures `@googlemaps/js-api-loader` options are set at most once per page load.
 * Calling `setOptions` multiple times triggers a console warning.
 */
export function ensureGoogleMapsLoaderOptions(apiKey: string): void {
    if (!apiKey) return;
    const g = globalThis as Record<string, unknown>;
    if (g[GLOBAL_FLAG]) return;
    setOptions({ key: apiKey, v: 'weekly' });
    g[GLOBAL_FLAG] = true;
}
