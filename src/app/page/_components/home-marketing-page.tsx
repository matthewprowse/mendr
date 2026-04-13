import { HomeMarketingPageClient } from '@/app/page/_components/home-marketing-page-client';

/** Server-composed marketing home: static sections render as HTML; motion and FAQ are client islands. */
export function HomeMarketingPage() {
    return <HomeMarketingPageClient />;
}
