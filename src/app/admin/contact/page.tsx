import type { Metadata } from 'next';
import AdminContactClient from './client';

export const metadata: Metadata = {
    title: 'Contact messages',
    robots: { index: false, follow: false },
};

export default function AdminContactPage() {
    return <AdminContactClient />;
}
