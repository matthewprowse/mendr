import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
    const base = getSiteUrl();

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/api/',
                '/admin/',
                '/auth/',
                '/start',
                '/welcome',
                '/diagnosis',
                '/match',
                '/report',
                '/chat',
                '/open-on-phone',
                '/pro/network',
                '/design',
                '/showcase',
            ],
        },
        sitemap: `${base}/sitemap.xml`,
    };
}
