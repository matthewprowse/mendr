import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
    const base = getSiteUrl();
    const now = new Date();

    const paths: Array<{
        path: string;
        changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
        priority: number;
    }> = [
        { path: '/', changeFrequency: 'weekly', priority: 1 },
        { path: '/pro/join', changeFrequency: 'weekly', priority: 0.95 },
        { path: '/about', changeFrequency: 'monthly', priority: 0.7 },
        { path: '/contact', changeFrequency: 'monthly', priority: 0.75 },
        { path: '/terms', changeFrequency: 'yearly', priority: 0.4 },
        { path: '/privacy', changeFrequency: 'yearly', priority: 0.4 },
    ];

    return paths.map(({ path, changeFrequency, priority }) => ({
        url: path === '/' ? base : `${base}${path}`,
        lastModified: now,
        changeFrequency,
        priority,
    }));
}
