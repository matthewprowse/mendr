import type { Metadata } from 'next';
import OpenOnPhonePageClient from './client';

export const metadata: Metadata = {
    title: 'Open on phone',
    description: 'Scan a QR code to continue Scandio on your mobile device.',
    robots: { index: false, follow: false },
};

export default function OpenOnPhonePage() {
    return <OpenOnPhonePageClient />;
}
