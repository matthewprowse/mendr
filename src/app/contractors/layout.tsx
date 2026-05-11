import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

export async function generateMetadata(): Promise<Metadata> {
    const base = getSiteUrl();
    const url = `${base}/contractors`;
    const title = 'Join the Scandio Contractor Network | Western Cape';
    const description =
        'Apply to receive informed homeowner enquiries with diagnosis context. Free to join, no commission. Built for trades and service teams in the Western Cape.';

    return {
        title,
        description,
        keywords: [
            'contractor leads',
            'Western Cape',
            'home services',
            'trades',
            'Scandio',
            'qualified enquiries',
            'no commission',
        ],
        alternates: {
            canonical: url,
        },
        openGraph: {
            title,
            description,
            type: 'website',
            url,
            locale: 'en_ZA',
            siteName: 'Scandio',
            images: [
                {
                    url: '/og-scandio-pro.jpg',
                    width: 1200,
                    height: 630,
                    alt: 'Scandio contractor network — informed leads for home service professionals',
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description:
                'Informed homeowner enquiries with diagnosis context. Free to join, no commission — Western Cape.',
            images: ['/og-scandio-pro.jpg'],
        },
    };
}

export default function ProJoinLayout({ children }: { children: ReactNode }) {
    return children;
}
