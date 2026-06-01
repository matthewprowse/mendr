import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/admin-guard';
import { WhatsappSimulator } from './simulator-client';

export const metadata: Metadata = {
    title: 'WhatsApp Simulator',
    robots: { index: false, follow: false },
};

export default async function WhatsappSimulatorPage() {
    await requireAdminPage();
    return <WhatsappSimulator />;
}
