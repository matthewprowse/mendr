import type { Metadata } from 'next';
import AdminProvidersClient from './client';

export const metadata: Metadata = {
    title: 'Providers',
    robots: { index: false, follow: false },
};

export default function AdminProvidersPage() {
    return <AdminProvidersClient />;
}
