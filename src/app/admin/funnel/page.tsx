import type { Metadata } from 'next';
import AdminFunnelClient from './client';

export const metadata: Metadata = {
    title: 'Onboarding funnel',
    robots: { index: false, follow: false },
};

export default function AdminFunnelPage() {
    return <AdminFunnelClient />;
}
