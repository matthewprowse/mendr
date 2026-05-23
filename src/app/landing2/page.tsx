import { LandingHeader } from '@/components/landing-header';
import { Badge } from '@/components/ui/badge';
import { playfair } from '@/lib/landing-fonts';
import { Land2Hero } from './components/hero';
import { Land2Pricing } from './components/pricing';
import { Land2Faq } from './components/faq';
import {
    Land2AntiPattern,
    Land2HowItWorks,
    Land2Comparison,
    Land2Bento,
    Land2Ranking,
    Land2Testimonials,
    Land2Coverage,
    Land2ApplicationCta,
    Land2Footer,
} from './components/server-sections';

export const metadata = {
    title:
        'Home Service Leads Cape Town — No Commission, No Shared Leads | Mendr for Pros',
    description:
        'Join the Mendr Pro network and get Western Cape homeowner enquiries that come with AI diagnosis context already attached. Free during founding phase. Zero commission. One enquiry, one provider.',
    openGraph: {
        title:
            'Home Service Leads Cape Town — No Commission, No Shared Leads | Mendr for Pros',
        description:
            'Join the Mendr Pro network and get Western Cape homeowner enquiries that come with AI diagnosis context already attached.',
        locale: 'en_ZA',
        type: 'website',
    },
};

/* Per brief Section 5 — JSON-LD schemas for the contractor page. */
const SCHEMA_JSON_LD = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Organization',
            name: 'Mendr',
            url: 'https://mendr.co.za',
            logo: 'https://mendr.co.za/logo.png',
            description:
                'Mendr connects Western Cape contractors with pre-diagnosed homeowner enquiries.',
        },
        {
            '@type': 'Service',
            serviceType: 'Lead Generation for Home Services Contractors',
            provider: { '@type': 'Organization', name: 'Mendr' },
            areaServed: 'Western Cape, South Africa',
            description:
                'Mendr provides Western Cape contractors with exclusive homeowner enquiries that include an AI-generated fault diagnosis report. Flat subscription pricing, zero commission.',
        },
        {
            '@type': 'Offer',
            name: 'Starter',
            price: '249',
            priceCurrency: 'ZAR',
            description:
                'Up to 30 enquiries per month. Listing in matching, AI-generated bio, photo gallery up to 10 photos.',
            availability: 'https://schema.org/PreOrder',
        },
        {
            '@type': 'Offer',
            name: 'Professional',
            price: '649',
            priceCurrency: 'ZAR',
            description:
                'Up to 100 enquiries per month. Priority placement, Recommended badge, multi-zone coverage.',
            availability: 'https://schema.org/PreOrder',
        },
        {
            '@type': 'Offer',
            name: 'Premium',
            price: '1249',
            priceCurrency: 'ZAR',
            description:
                'Unlimited enquiries. Featured placement. Dedicated account support and onboarding.',
            availability: 'https://schema.org/PreOrder',
        },
        {
            '@type': 'FAQPage',
            mainEntity: [
                {
                    '@type': 'Question',
                    name: 'Is it really free to join right now?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes. During the founding phase there is no application fee, no monthly subscription, and Mendr does not take commission on any work you do through the platform.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'How is Mendr different from Snupit or Kandua?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Mendr does not sell your lead to multiple providers — one enquiry goes to one provider. Every enquiry comes with a structured diagnosis report attached. Mendr also does not take a commission on jobs.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'When do paid plans start?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Paid plans roll out once homeowner volume justifies them. Founding providers receive at least 30 days written notice before any billing begins, and must opt in.',
                    },
                },
            ],
        },
    ],
};

export default function Landing2Page() {
    return (
        <div className={`${playfair.variable} flex min-h-screen flex-col bg-[#F4EFE6]`}>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_JSON_LD) }}
            />
            <a
                href="#hero"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#1C2B3A] focus:shadow-lg"
            >
                Skip to content
            </a>
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#why', label: 'Why Join' },
                    { href: '#pricing', label: 'Pricing' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/landing1', label: 'For Homeowners' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/landing2"
                showTrades={false}
                logoBadge={<Badge variant="secondary">Pro</Badge>}
                mobileCtaHref="/contractors/network"
                mobileCtaLabel="Join The Network"
            />
            <main className="flex-1">
                {/* 2.1 — Hero */}
                <Land2Hero />
                {/* 2.2 — Anti-Pattern Callout */}
                <Land2AntiPattern />
                {/* 2.3 — How It Works */}
                <Land2HowItWorks />
                {/* 2.4 — Comparison Table */}
                <Land2Comparison />
                {/* 2.5 — Why Providers Join (Bento) */}
                <Land2Bento />
                {/* 2.6 — Ranking Algorithm Explainer */}
                <Land2Ranking />
                {/* 2.7 — Pricing */}
                <Land2Pricing />
                {/* 2.8 — Provider Testimonials + Mini Case Study */}
                <Land2Testimonials />
                {/* 2.9 — Coverage */}
                <Land2Coverage />
                {/* 2.10 — FAQ */}
                <Land2Faq />
                {/* 2.11 — Final CTA */}
                <Land2ApplicationCta />
            </main>
            {/* 2.12 — Footer */}
            <Land2Footer />
        </div>
    );
}
