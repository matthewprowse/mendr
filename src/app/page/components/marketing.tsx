import { LandingHeader } from '@/components/landing-header';
import { HomeMarketingHeroClient } from '@/app/page/components/hero';
import { HomeMarketingHowItWorksClient } from '@/app/page/components/how-it-works';
import { HomeMarketingFaqClient } from '@/app/page/components/faq';
import {
    HomeMarketingProblemSection,
    HomeMarketingValueSection,
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
                    { href: '#value', label: 'Why Menda' },
                    { href: '/contact', label: 'Contact' },
                    { href: '#faq', label: 'FAQ' },
                    { href: '/contractors', label: 'For Pros' },
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
