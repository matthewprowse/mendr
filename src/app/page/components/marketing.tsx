import { LandingHeader } from '@/components/landing-header';
import { HomeMarketingHeroClient } from '@/app/page/components/hero';
import { HomeMarketingHowItWorksClient } from '@/app/page/components/how-it-works';
import { HomeMarketingFaqClient } from '@/app/page/components/faq';
import { HomeMarketingTrades } from '@/app/page/components/trades';
import { TestimonialsSection } from '@/app/page/components/testimonials-section';
import {
    HomeMarketingProblemSection,
    HomeMarketingValueSection,
    HomeMarketingCoverageSection,
    HomeMarketingCtaSection,
    HomeMarketingFooter,
} from '@/app/page/components/server-sections';

/** Server-composed marketing home: static sections render as HTML; motion and FAQ are client islands. */
export function HomeMarketingPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#trades', label: 'What We Cover' },
                    { href: '#value', label: 'Why Mendr' },
                    { href: '/contact', label: 'Contact' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/pro', label: 'For Pros' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <HomeMarketingHeroClient />
                <HomeMarketingProblemSection />
                <HomeMarketingHowItWorksClient />
                <HomeMarketingTrades />
                <HomeMarketingValueSection />
                <TestimonialsSection />
                <HomeMarketingCoverageSection />
                <HomeMarketingFaqClient />
                <HomeMarketingCtaSection />
            </main>

            <HomeMarketingFooter />
        </div>
    );
}
