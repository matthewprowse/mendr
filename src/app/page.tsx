import type { Metadata } from 'next';
import { HomeMarketingPage } from './page/components/marketing';
import { getSiteUrl } from '@/lib/site-url';
import { FAQS } from '@/app/page/components/content';

export async function generateMetadata(): Promise<Metadata> {
    const base = getSiteUrl();
    const canonical = `${base}/`;
    const title = 'Home Fault Diagnosis Cape Town — Free Report | Menda';
    const description =
        'Upload a photo of any home fault — plumbing, electrical, damp, roofing — and get a clear written report in under 60 seconds. Free for Western Cape homeowners. No account needed.';

    return {
        title,
        description,
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
                    url: '/og-menda.jpg',
                    width: 1200,
                    height: 630,
                    alt: 'Menda home maintenance diagnosis app showing a completed fault report on a mobile phone screen',
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: 'Upload a photo of any home fault and get a written diagnosis report in under 60 seconds. Free. No account needed.',
            images: ['/og-menda.jpg'],
        },
    };
}

function buildJsonLd(base: string) {
    const orgId = `${base}/#organization`;
    const websiteId = `${base}/#website`;
    const softwareId = `${base}/#software`;
    const localBusinessId = `${base}/#localbusiness`;
    const faqPageId = `${base}/#faqpage`;

    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: 'Menda',
                url: base,
            },
            {
                '@type': 'WebSite',
                '@id': websiteId,
                name: 'Menda',
                url: base,
                publisher: { '@id': orgId },
            },
            {
                '@type': 'SoftwareApplication',
                '@id': softwareId,
                name: 'Menda',
                applicationCategory: 'HomeImprovement',
                operatingSystem: 'Web',
                description:
                    'Upload a photo of a home fault — plumbing, electrical, damp, roofing, or structural — and receive a written diagnosis report in under 60 seconds. Free for Western Cape homeowners.',
                url: base,
                offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'ZAR',
                    description: 'Free Menda Report — no account required',
                },
                areaServed: {
                    '@type': 'State',
                    name: 'Western Cape',
                    addressCountry: 'ZA',
                },
                creator: { '@id': orgId },
                isPartOf: { '@id': websiteId },
            },
            {
                '@type': 'LocalBusiness',
                '@id': localBusinessId,
                name: 'Menda',
                description: 'AI-powered home fault diagnosis for Western Cape homeowners.',
                url: base,
                areaServed: [
                    { '@type': 'City', name: 'Cape Town' },
                    { '@type': 'City', name: 'Stellenbosch' },
                    { '@type': 'City', name: 'Somerset West' },
                    { '@type': 'City', name: 'Paarl' },
                ],
                serviceArea: {
                    '@type': 'State',
                    name: 'Western Cape',
                    addressCountry: 'ZA',
                },
            },
            {
                '@type': 'FAQPage',
                '@id': faqPageId,
                mainEntity: FAQS.map((faq) => ({
                    '@type': 'Question',
                    name: faq.q,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: faq.a,
                    },
                })),
            },
            {
                '@type': 'Service',
                name: 'Plumbing Fault Diagnosis',
                description:
                    'Upload a photo of a plumbing issue - leaks, burst pipes, low pressure - and receive a structured diagnosis report.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
            },
            {
                '@type': 'Service',
                name: 'Electrical Fault Diagnosis',
                description:
                    'Upload a photo of an electrical issue and receive a structured diagnosis report before speaking to providers.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
            },
            {
                '@type': 'Service',
                name: 'Structural Fault Diagnosis',
                description:
                    'Upload a photo of a structural issue and receive a structured diagnosis report with practical next steps.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
            },
            {
                '@type': 'Service',
                name: 'Damp and Waterproofing Fault Diagnosis',
                description:
                    'Upload a photo of damp or waterproofing issues and receive a structured diagnosis report in under 60 seconds.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
            },
            {
                '@type': 'Service',
                name: 'Roofing Fault Diagnosis',
                description:
                    'Upload a photo of a roofing issue and receive a structured diagnosis report with likely causes and next actions.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'ZAR' },
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
