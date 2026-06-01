import { META_ADMIN } from '@/lib/site-metadata';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import AiCostsClient from './client';

export const metadata = META_ADMIN;

export default async function AdminAiCostsPage() {
    await requireAdminPage();
    return <AiCostsClient />;
}
