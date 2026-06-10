import { META_CONTRACTORS } from '@/lib/site-metadata';
import { getSiteUrl } from '@/lib/site-url';
import { PRO_FAQS } from './content';
import ProJoinPageClient from './client';

export const metadata = META_CONTRACTORS;

function buildProJsonLd(base: string) {
    const orgId = `${base}/#organization`;
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': orgId,
                name: 'Mendr',
                url: base,
            },
            {
                '@type': 'Service',
                name: 'Mendr Contractor Network',
                serviceType: 'Lead generation for home services contractors',
                description:
                    'A founding network where Western Cape home service contractors receive informed homeowner enquiries that already include AI diagnosis context. Free to join, no commission on completed jobs.',
                provider: { '@id': orgId },
                areaServed: { '@type': 'State', name: 'Western Cape', addressCountry: 'ZA' },
                offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'ZAR',
                    description: 'Free to join during the founding phase — no commission',
                },
            },
            {
                '@type': 'FAQPage',
                '@id': `${base}/pro#faqpage`,
                mainEntity: PRO_FAQS.map((faq) => ({
                    '@type': 'Question',
                    name: faq.q,
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: faq.a,
                    },
                })),
            },
        ],
    };
}

export default function ProJoinPage() {
    const jsonLd = buildProJsonLd(getSiteUrl());
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <ProJoinPageClient />
        </>
    );
}
