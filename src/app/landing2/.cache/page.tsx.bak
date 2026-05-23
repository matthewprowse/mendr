import { LandingHeader } from '@/components/landing-header';
import { Badge } from '@/components/ui/badge';
import { playfair } from '@/lib/landing-fonts';
import { Land2Hero } from './components/hero';
import { Land2Pricing } from './components/pricing';
import { Land2Faq } from './components/faq';
import {
    Land2LeadQuality,
    Land2ZeroCommission,
    Land2HowItWorks,
    Land2Testimonials,
    Land2ApplicationCta,
    Land2Footer,
} from './components/server-sections';

export const metadata = {
    title: 'Mendr Pro — Get Pre-Diagnosed Leads, Zero Commission',
    description:
        'Join Mendr as a founding contractor. Receive pre-diagnosed homeowner leads in the Western Cape. No commission ever — flat monthly subscription only.',
};

export default function Landing2Page() {
    return (
        <div className={`${playfair.variable} flex min-h-screen flex-col bg-[#F4EFE6]`}>
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#pricing', label: 'Pricing' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/landing1', label: 'For Homeowners' },
                ]}
                logoHref="/landing2"
                showTrades={false}
                logoBadge={<Badge variant="secondary">Pro</Badge>}
                mobileCtaHref="#apply"
                mobileCtaLabel="Apply for early access"
            />
            <main className="flex-1">
                <Land2Hero />
                <Land2LeadQuality />
                <Land2ZeroCommission />
                <Land2HowItWorks />
                <Land2Testimonials />
                <Land2Pricing />
                <Land2Faq />
                <Land2ApplicationCta />
            </main>
            <Land2Footer />
        </div>
    );
}
