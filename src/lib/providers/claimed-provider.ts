/**
 * Resolve the provider a logged-in Pro owns (Phase 4 of the onboarding plan).
 *
 * Everything in the Pro portal scopes off this. A Pro is linked to a provider
 * either directly (`providers.claimed_by_user_id`) or via their approved
 * application (`provider_applications.matched_provider_id`). Duplicate scraped
 * rows are skipped via `merged_into`.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export async function getClaimedProviderId(userId: string): Promise<string | null> {
    const admin = await createSupabaseAdminClient();

    const { data: claimed } = await admin
        .from('providers')
        .select('id')
        .eq('claimed_by_user_id', userId)
        .is('merged_into', null)
        .limit(1);
    if (claimed && claimed.length > 0) {
        return (claimed[0] as { id: string }).id;
    }

    const { data: app } = await admin
        .from('provider_applications')
        .select('matched_provider_id')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .not('matched_provider_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
    if (app && app.length > 0) {
        const id = (app[0] as { matched_provider_id: string | null }).matched_provider_id;
        return id ?? null;
    }

    return null;
}
