/**
 * Public marketing origin: canonical URLs, SEO metadata, sitemaps, robots.
 * Set `NEXT_PUBLIC_APP_URL` in Vercel (e.g. https://mendr.co.za). // TODO(mendr-domain): update to real domain once mendr.co.za is live
 */
export function getSiteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    if (explicit) return explicit;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'https://mendr.co.za'; // TODO(mendr-domain): update to real domain once mendr.co.za is live
}

/**
 * Origin where the product UI lives (onboarding, authenticated flows).
 * Use when marketing is on the apex domain and the app is on a subdomain.
 * Set `NEXT_PUBLIC_APP_ORIGIN` in Vercel (e.g. https://app.mendr.co.za). // TODO(mendr-domain): update to real domain once mendr.co.za is live
 * If the whole product is served from one host, set both env vars to that origin (or only `NEXT_PUBLIC_APP_URL`).
 */
export function getAppOrigin(): string {
    const explicit = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, '');
    if (explicit) return explicit;
    return 'https://app.mendr.co.za'; // TODO(mendr-domain): update to real domain once mendr.co.za is live
}
