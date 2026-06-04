import { permanentRedirect } from 'next/navigation';

/**
 * Legacy redirect: the Pro public profile moved from `/contractors/[id]` to
 * `/pro/[id]`. This keeps old/shared links and SEO intact. The portal routes
 * (`/contractors/account`, `/contractors/network`, ...) are more specific and
 * are not matched by this dynamic segment.
 */
type PageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyProProfileRedirect({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;

    const pairs: string[] = [];
    for (const [key, value] of Object.entries(sp)) {
        const v = Array.isArray(value) ? value[0] : value;
        if (typeof v === 'string' && v) {
            pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
        }
    }
    const query = pairs.length > 0 ? `?${pairs.join('&')}` : '';

    permanentRedirect(`/pro/${encodeURIComponent(id)}${query}`);
}
