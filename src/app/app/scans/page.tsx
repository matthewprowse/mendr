import type { Metadata } from 'next';
import { AppChatsPageClient } from '../chats/_components/app-chats-page-client';

export const metadata: Metadata = {
    title: 'Scans | Scandio',
};

export default function AppScansPage() {
    return <AppChatsPageClient />;
}

