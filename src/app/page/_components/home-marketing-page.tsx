import { LandingHeader } from '@/components/landing-header';
import { HomeMarketingHeroClient } from '@/app/page/_components/home-marketing-hero-client';
import { HomeMarketingHowItWorksClient } from '@/app/page/_components/home-marketing-how-it-works-client';
import { HomeMarketingFaqClient } from '@/app/page/_components/home-marketing-faq-client';
import {
    HomeMarketingProblemSection,
    HomeMarketingValueSection,
    HomeMarketingCtaSection,
    HomeMarketingFooter,
} from '@/app/page/_components/home-marketing-server-sections';

/** Server-composed marketing home: static sections render as HTML; motion and FAQ are client islands. */
export function HomeMarketingPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '#how-it-works', label: 'How It Works' },
                    { href: '#value', label: 'Why Scandio' },
                    { href: '/contact', label: 'Contact' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/pro/join', label: 'For Pros' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <HomeMarketingHeroClient />
                <HomeMarketingProblemSection />
                <HomeMarketingHowItWorksClient />
                <HomeMarketingValueSection />
                <HomeMarketingFaqClient />
                <HomeMarketingCtaSection />
            </main>

            <HomeMarketingFooter />
        </div>
    );
}
