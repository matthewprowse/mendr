import type { Metadata } from 'next';
import { LandingPageClient } from './page/_components/landing-page-client';

export const metadata: Metadata = {
    title: 'Home Fault Diagnosis — Free Scandio Report | Western Cape',
    description:
        'Scandio diagnoses home maintenance faults in under 60 seconds. Get a free professional report, cost estimates, and connect with vetted Western Cape contractors. No account needed.',
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
        canonical: 'https://scandio.app/',
    },
    openGraph: {
        title: 'Home Fault Diagnosis — Free Scandio Report | Western Cape',
        description:
            'Diagnose home maintenance faults in under 60 seconds. Get a free professional report, cost estimates, and connect with vetted Western Cape contractors. No account needed.',
        type: 'website',
        url: 'https://scandio.app/',
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
        title: 'Home Fault Diagnosis — Free Scandio Report | Western Cape',
        description:
            'Diagnose home maintenance faults in under 60 seconds. Free, no account needed.',
        images: ['/og-scandio.jpg'],
    },
};

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Scandio',
    applicationCategory: 'HomeImprovement',
    operatingSystem: 'Web',
    description:
        'AI-powered home maintenance fault diagnosis. Upload a photo, receive a professional Scandio Report, and connect with vetted local contractors in the Western Cape.',
    url: 'https://scandio.app',
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
    creator: {
        '@type': 'Organization',
        name: 'Scandio',
        url: 'https://scandio.app',
    },
};

export default function HomePage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <LandingPageClient />
        </>
    );
}
