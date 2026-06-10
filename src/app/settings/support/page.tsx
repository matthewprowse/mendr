import type { Metadata } from 'next';
import SupportClient from './client';

export const metadata: Metadata = {
    title: 'Support',
    description: 'Send Mendr a message.',
    robots: { index: false, follow: false },
};

export default function SupportPage() {
    return <SupportClient />;
}
