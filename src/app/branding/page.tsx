import type { Metadata } from 'next';
import BrandingClient from './client';

export const metadata: Metadata = {
    title: 'Branding & Design Audit — Mendr',
    robots: { index: false, follow: false },
};

export default function BrandingPage() {
    return <BrandingClient />;
}
