import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { PropertyVaultClient } from './_components/property-vault-client';

export const metadata: Metadata = {
    title: 'Property Vault',
    description: 'Your scan history and diagnosis timeline.',
};

export default async function PropertyVaultPage() {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: conversations } = await supabase
        .from('conversations')
        .select('id, title, image_url, customer_address, customer_lat, customer_lng, diagnosis, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const reportIds = new Set<string>();
    if (conversations?.length) {
        const { data: reports } = await supabase
            .from('scandio_reports')
            .select('conversation_id')
            .in('conversation_id', conversations.map((c) => c.id));
        reports?.forEach((r) => reportIds.add(r.conversation_id));
    }

    let locationOptions: Array<{ id: string; nickname: string; address: string }> = [];
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('locations')
            .eq('id', user.id)
            .maybeSingle();
        const locs = profile?.locations;
        if (Array.isArray(locs)) {
            locationOptions = locs.map((l: { id?: string; nickname?: string; address?: string }) => ({
                id: l.id ?? '',
                nickname: l.nickname ?? l.address ?? 'Property',
                address: l.address ?? '',
            }));
        }
    } catch {
        // profiles table may not exist yet
    }
    const scans = (conversations ?? []).map((c) => ({
        id: c.id,
        title: c.title ?? 'Scan',
        imageUrl: c.image_url ?? null,
        address: c.customer_address ?? null,
        diagnosis: c.diagnosis as Record<string, unknown> | null,
        createdAt: c.created_at,
        hasReport: reportIds.has(c.id),
    }));

    return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Property Vault
                </h1>
                <p className="mt-2 text-muted-foreground">
                    Your scan history. Filter by property or browse your full timeline.
                </p>
            </div>
            <PropertyVaultClient
                scans={scans}
                locationOptions={locationOptions}
            />
        </div>
    );
}
