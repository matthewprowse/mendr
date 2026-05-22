import { LandingHeader } from '@/components/landing-header';
import { playfair } from '@/lib/landing-fonts';
import { Land1Hero } from './components/hero';
import { Land1Demo } from './components/demo';
import { Land1Faq } from './components/faq';
import {
    Land1TrustBar,
    Land1HowItWorks,
    Land1BentoGrid,
    Land1Testimonials,
    Land1CapeTown,
    Land1Coverage,
    Land1FinalCta,
    Land1Footer,
} from './components/server-sections';

export const metadata = {
    title: 'Mendr — Free Home Fault Diagnosis, Western Cape',
    description:
        'Upload a photo of any home fault and get a free AI-powered written diagnosis in under 60 seconds. Built for Western Cape homeowners. No account required.',
};

export default function Landing1Page() {
    return (
        <div className={`${playfair.variable} flex min-h-screen flex-col bg-[#F4EFE6]`}>
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#coverage', label: 'Coverage' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/landing2', label: 'For Contractors' },
                ]}
                logoHref="/landing1"
                showTrades={false}
                mobileCtaHref="/start"
                mobileCtaLabel="Get free diagnosis"
            />
            <main className="flex-1">
                <Land1Hero />
                <Land1TrustBar />
                <Land1Demo />
                <Land1HowItWorks />
                <Land1BentoGrid />
                <Land1Testimonials />
                <Land1CapeTown />
                <Land1Coverage />
                <Land1Faq />
                <Land1FinalCta />
            </main>
            <Land1Footer />
        </div>
    );
}
