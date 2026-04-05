import type { Metadata } from 'next';
import ProOnboardPageClient from './pro-onboard-page-client';

export const metadata: Metadata = {
    title: 'Provider onboarding',
    description: 'Complete your Scandio provider profile and service areas.',
    robots: { index: false, follow: false },
};

export default function ProOnboardPage() {
    return <ProOnboardPageClient />;
}
