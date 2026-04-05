import type { Metadata } from 'next';
import WelcomePageClient from './welcome-page-client';

export const metadata: Metadata = {
    title: 'New Scan',
    description: 'Upload a photo to begin your free Scandio home maintenance diagnosis.',
};

export default function WelcomePage() {
    return <WelcomePageClient />;
}
