import type { Metadata } from 'next';
import AdminLoginClient from './client';

export const metadata: Metadata = {
    title: 'Admin sign in',
    robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
    return <AdminLoginClient />;
}
