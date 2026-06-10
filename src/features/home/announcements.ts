import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export type Announcement = {
    slug: string;
    title: string;
    summary: string | null;
    body: string | null;
    image_url: string | null;
    published_at: string;
};

const PUBLISHED_SELECT = 'slug, title, summary, body, image_url, published_at';

/** Latest published announcements, newest first. RLS already hides drafts. */
export async function getLatestAnnouncements(limit = 3): Promise<Announcement[]> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
        .from('feature_announcements')
        .select(PUBLISHED_SELECT)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false })
        .limit(limit);
    return (data ?? []) as Announcement[];
}

export async function getAnnouncementBySlug(slug: string): Promise<Announcement | null> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
        .from('feature_announcements')
        .select(PUBLISHED_SELECT)
        .eq('slug', slug)
        .lte('published_at', new Date().toISOString())
        .maybeSingle();
    return (data as Announcement) ?? null;
}
