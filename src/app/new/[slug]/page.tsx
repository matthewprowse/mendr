import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAnnouncementBySlug } from '@/features/home/announcements';
import AnnouncementClient from './client';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const announcement = await getAnnouncementBySlug(slug);
    if (!announcement) return { title: "What's New" };
    return {
        title: announcement.title,
        description: announcement.summary ?? undefined,
    };
}

export default async function AnnouncementPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const announcement = await getAnnouncementBySlug(slug);
    if (!announcement) notFound();
    return <AnnouncementClient announcement={announcement} />;
}
