import type { Metadata } from 'next';
import { getLatestAnnouncements } from '@/features/home/announcements';
import WhatsNewClient from './client';

export const metadata: Metadata = {
    title: "What's New",
    description: 'The latest features and updates on Mendr.',
};

export default async function WhatsNewPage() {
    const announcements = await getLatestAnnouncements(50);
    return <WhatsNewClient announcements={announcements} />;
}
