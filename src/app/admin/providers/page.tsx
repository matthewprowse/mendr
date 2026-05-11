import { META_ADMIN_PROVIDERS } from '@/lib/site-metadata';
import AdminProvidersClient from './client';

export const metadata = META_ADMIN_PROVIDERS;

export default function AdminProvidersPage() {
    return <AdminProvidersClient />;
}
