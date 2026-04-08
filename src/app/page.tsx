import type { Metadata } from 'next';
import { HomeMarketingPage } from './page/components/marketing';
import { getSiteUrl } from '@/lib/site-url';

export async function generateMetadata(): Promise<Metadata> {
    const base = getSiteUrl();
    const canonical = `${base}/`;
    const title = 'Home Fault Diagnosis — Free Scandio Report | Western Cape';
    const description =
        'Scandio diagnoses home maintenance faults in under 60 seconds. Get a free professional report, cost estimates, and connect with local Western Cape contractors. No account needed.';

    return {
        title,
        description,
        keywords: [
            'home maintenance',
            'home repair',
            'Western Cape',
            'Cape Town',
            'contractors',
            'fault diagnosis',
            'Scandio',
            'plumbing',
            'electrical',
            'home maintenance app',
        ],
        alternates: {
            canonical,
        },
        openGraph: {
            title,
            description,
            type: 'website',
            url: canonical,
            locale: 'en_ZA',
            images: [
                {
                    url: '/og-scandio.jpg',
                    width: 1200,
                    height: 630,
                    alt: 'Scandio home maintenance diagnosis app showing a completed fault report on a mobile phone screen',
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: 'Diagnose home maintenance faults in under 60 seconds. Free, no account needed.',
            images: ['/og-scandio.jpg'],
        },
    };
}

function buildJsonLd(base: string) {
    const orgId = `${base}/#organization`;
    const websiteId = `${base}/#website`;
    const softwareId = `${base}/#software`;

    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: 'Scandio',
                url: base,
            },
            {
                '@type': 'WebSite',
                '@id': websiteId,
                name: 'Scandio',
                url: base,
                publisher: { '@id': orgId },
            },
            {
                '@type': 'SoftwareApplication',
                '@id': softwareId,
                name: 'Scandio',
                applicationCategory: 'HomeImprovement',
                operatingSystem: 'Web',
                description:
                    'AI-powered home maintenance fault diagnosis. Upload a photo, receive a professional Scandio Report, and connect with local contractors in the Western Cape.',
                url: base,
                offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'ZAR',
                    description: 'Free Scandio Report — no account required',
                },
                areaServed: {
                    '@type': 'State',
                    name: 'Western Cape',
                    addressCountry: 'ZA',
                },
                creator: { '@id': orgId },
                isPartOf: { '@id': websiteId },
            },
        ],
    };
}

export default async function HomePage() {
    const base = getSiteUrl();
    const jsonLd = buildJsonLd(base);

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <HomeMarketingPage />
        </>
    );
}
