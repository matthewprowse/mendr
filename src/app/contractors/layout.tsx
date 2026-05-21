import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

export async function generateMetadata(): Promise<Metadata> {
    const base = getSiteUrl();
    const url = `${base}/contractors`;
    const title = 'Join the Menda Contractor Network | Western Cape';
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
            'Menda',
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
            siteName: 'Menda',
            images: [
                {
                    url: '/og-menda-pro.jpg',
                    width: 1200,
                    height: 630,
                    alt: 'Menda contractor network — informed leads for home service professionals',
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description:
                'Informed homeowner enquiries with diagnosis context. Free to join, no commission — Western Cape.',
            images: ['/og-menda-pro.jpg'],
        },
    };
}

export default function ProJoinLayout({ children }: { children: ReactNode }) {
    return (
        <>
            <nav className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
                <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
                    <a href="/contractors" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
                        Menda Contractors
                    </a>
                    <a
                        href="/contractors/account"
                        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                    >
                        My Account
                    </a>
                </div>
            </nav>
            {children}
        </>
    );
}
