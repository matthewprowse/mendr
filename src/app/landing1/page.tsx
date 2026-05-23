import { LandingHeader } from '@/components/landing-header';
import { playfair } from '@/lib/landing-fonts';
import { Land1Hero } from './components/hero';
import { Land1HowItWorks } from './components/demo';
import { Land1Faq } from './components/faq';
import {
    Land1ProblemFraming,
    Land1TradeRails,
    Land1BentoGrid,
    Land1TrustBand,
    Land1Coverage,
    Land1FinalCta,
    Land1Footer,
} from './components/server-sections';

export const metadata = {
    title: 'Home Fault Diagnosis Cape Town — Free Report in 60 Seconds | Mendr',
    description:
        'Take a photo of any home fault — damp, leak, electrical, roof, structural — and get a clear written diagnosis report in under 60 seconds. Free for Western Cape homeowners. No account needed.',
    openGraph: {
        title: 'Home Fault Diagnosis Cape Town — Free Report in 60 Seconds | Mendr',
        description:
            'Take a photo of any home fault and get a clear written diagnosis report in under 60 seconds. Free for Western Cape homeowners.',
        locale: 'en_ZA',
        type: 'website',
    },
};

/* Per brief Section 5 — JSON-LD schemas for the homepage. */
const SCHEMA_JSON_LD = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Organization',
            name: 'Mendr',
            url: 'https://mendr.co.za',
            logo: 'https://mendr.co.za/logo.png',
            description:
                'Mendr is a free AI-powered home fault diagnosis tool for Western Cape homeowners.',
            address: {
                '@type': 'PostalAddress',
                addressLocality: 'Cape Town',
                addressRegion: 'Western Cape',
                addressCountry: 'ZA',
            },
        },
        {
            '@type': 'WebSite',
            url: 'https://mendr.co.za',
            name: 'Mendr',
            description: 'Free home fault diagnosis for Western Cape homeowners.',
            inLanguage: 'en-ZA',
        },
        {
            '@type': 'SoftwareApplication',
            name: 'Mendr',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web, iOS, Android',
            offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'ZAR',
            },
            description:
                'AI-powered home fault diagnosis platform. Take a photo of any home fault and get a written diagnosis report in under 60 seconds.',
        },
        {
            '@type': 'LocalBusiness',
            name: 'Mendr',
            image: 'https://mendr.co.za/og-image.png',
            address: {
                '@type': 'PostalAddress',
                addressLocality: 'Cape Town',
                addressRegion: 'Western Cape',
                addressCountry: 'ZA',
            },
            areaServed: 'Western Cape, South Africa',
            priceRange: 'Free',
        },
        {
            '@type': 'FAQPage',
            mainEntity: [
                {
                    '@type': 'Question',
                    name: 'Is Mendr really free?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes — getting a Mendr report is free for Western Cape homeowners. There is no account to set up and no payment details to enter.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'How accurate is the diagnosis?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Mendr gives a strong starting point based on your photo and description, with a confidence score on every report. It is not a replacement for someone coming to look.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'Can Mendr diagnose damp problems?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes — damp is one of the most common things Mendr handles, especially in coastal Cape Town homes. The report will tell you whether it is likely rising damp, penetrating damp, or condensation.',
                    },
                },
                {
                    '@type': 'Question',
                    name: 'Is my report private?',
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: 'Yes. Reports are private by default. They only get shared when you choose to share them with a specific provider.',
                    },
                },
            ],
        },
    ],
};

export default function Landing1Page() {
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
                    { href: '#why', label: 'Why Mendr' },
                    { href: '#trades', label: 'Trades' },
                    { href: '#coverage', label: 'Coverage' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/landing2', label: 'For Pros' },
                    { href: '/contact', label: 'Contact' },
                ]}
                logoHref="/landing1"
                showTrades={false}
                mobileCtaHref="/start"
                mobileCtaLabel="Free Report"
            />
            <main className="flex-1">
                {/* 1.1 — Hero */}
                <Land1Hero />
                {/* 1.2 — Problem Framing */}
                <Land1ProblemFraming />
                {/* 1.3 — How It Works (3 alternating steps) */}
                <Land1HowItWorks />
                {/* 1.4 — Trade Rails (6 trades) */}
                <Land1TradeRails />
                {/* 1.5 — Why Mendr (Bento) */}
                <Land1BentoGrid />
                {/* 1.6 — Trust Band */}
                <Land1TrustBand />
                {/* 1.7 — Coverage */}
                <Land1Coverage />
                {/* 1.8 — FAQ */}
                <Land1Faq />
                {/* 1.9 — Final CTA */}
                <Land1FinalCta />
            </main>
            {/* 1.10 — Footer */}
            <Land1Footer />
        </div>
    );
}
