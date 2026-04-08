import type { Metadata } from 'next';
import AdminDashboardClient from './client';

export const metadata: Metadata = {
    title: 'Admin',
    description: 'Scandio admin dashboard.',
    robots: { index: false, follow: false },
};

export default function AdminPage() {
    return <AdminDashboardClient />;
}
