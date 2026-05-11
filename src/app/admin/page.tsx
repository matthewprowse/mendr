import { META_ADMIN } from '@/lib/site-metadata';
import AdminDashboardClient from './client';

export const metadata = META_ADMIN;

export default function AdminPage() {
    return <AdminDashboardClient />;
}
