/**
 * Provider write authorization (finding H5).
 *
 * Several provider mutation routes ran through the service role with no
 * ownership check, letting anyone attach images to, sync, or mutate any
 * provider by id. Ownership follows the approved-application →
 * matched_provider_id pattern established in api/contractors/account.
 *
 * Onboarding nuance: contractors enrich the Google-matched provider they are
 * about to claim *before* an application exists, and may not be signed in. Those
 * providers are still UNCLAIMED (no claimed_by_user_id) and their uploads land
 * as `pending` + moderated, so we allow writes to unclaimed providers and gate
 * only claimed/established providers to their owner (or an admin).
 */

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { isAdminUser } from '@/lib/auth/admin-access';

type AdminClient = Awaited<ReturnType<typeof createSupabaseAdminClient>>;

/** Authenticated session user id, or null for anonymous callers. */
export async function getSessionUserId(): Promise<string | null> {
    try {
        const client = await createSupabaseServerClient();
        const {
            data: { user },
        } = await client.auth.getUser();
        return user?.id ?? null;
    } catch {
        return null;
    }
}

/** True when the user has an application linking them to this provider. */
export async function userOwnsProvider(
    admin: AdminClient,
    userId: string,
    providerId: string,
): Promise<boolean> {
    const { data } = await admin
        .from('provider_applications')
        .select('id')
        .eq('user_id', userId)
        .eq('matched_provider_id', providerId)
        .limit(1)
        .maybeSingle();
    return !!data;
}

/** Existence + claim state of a provider row. */
export async function providerClaimState(
    admin: AdminClient,
    providerId: string,
): Promise<{ exists: boolean; claimed: boolean }> {
    const { data } = await admin
        .from('providers')
        .select('claimed_by_user_id')
        .eq('id', providerId)
        .maybeSingle();
    if (!data) return { exists: false, claimed: false };
    return { exists: true, claimed: !!(data as { claimed_by_user_id: string | null }).claimed_by_user_id };
}

export type AuthorizeResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Authorize a write to a provider. Unclaimed providers are writable (onboarding
 * enrichment, moderated). Claimed providers require the owner or an admin.
 */
export async function authorizeProviderWrite(providerId: string): Promise<AuthorizeResult> {
    const admin = await createSupabaseAdminClient();
    const state = await providerClaimState(admin, providerId);
    if (!state.exists) return { ok: false, status: 404, error: 'Provider not found.' };
    if (!state.claimed) return { ok: true };

    const userId = await getSessionUserId();
    if (userId && (await userOwnsProvider(admin, userId, providerId))) return { ok: true };
    if (await isAdminUser()) return { ok: true };
    return { ok: false, status: 403, error: 'You do not have permission to modify this provider.' };
}
