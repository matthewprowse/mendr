// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { requireAdmin } from '@/lib/auth/admin-auth';

type ProviderRef = { name: string | null; address: string | null };
type ClaimRow = {
    id: string;
    provider_id: string;
    user_id: string;
    created_at: string;
    providers: ProviderRef | ProviderRef[] | null;
};

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('provider_claims')
        .select('id, provider_id, user_id, created_at, providers(name, address)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const claims = (data ?? []) as ClaimRow[];

    // Leads waiting on each claimed provider.
    const ids = claims.map((c) => c.provider_id);
    const leadCounts = new Map<string, number>();
    if (ids.length > 0) {
        const { data: events } = await admin
            .from('provider_contact_events')
            .select('provider_id')
            .in('provider_id', ids);
        for (const e of (events ?? []) as { provider_id: string }[]) {
            leadCounts.set(e.provider_id, (leadCounts.get(e.provider_id) ?? 0) + 1);
        }
    }

    const result = await Promise.all(
        claims.map(async (c) => {
            const provider = Array.isArray(c.providers) ? c.providers[0] : c.providers;
            let email: string | null = null;
            try {
                const { data: u } = await admin.auth.admin.getUserById(c.user_id);
                email = u.user?.email ?? null;
            } catch {
                /* ignore */
            }
            return {
                id: c.id,
                providerId: c.provider_id,
                providerName: provider?.name ?? 'Unnamed business',
                providerAddress: provider?.address ?? '',
                email,
                leads: leadCounts.get(c.provider_id) ?? 0,
                createdAt: c.created_at,
            };
        })
    );

    return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;

    const body = (await req.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const action = body?.action;
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
    if (action !== 'approve' && action !== 'reject') {
        return NextResponse.json({ error: 'action must be approve or reject.' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();
    const { data: claim } = await admin
        .from('provider_claims')
        .select('id, provider_id, user_id, status')
        .eq('id', id)
        .maybeSingle();
    const c = claim as
        | { id: string; provider_id: string; user_id: string; status: string }
        | null;
    if (!c || c.status !== 'pending') {
        return NextResponse.json({ error: 'Claim not found or already reviewed.' }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
        // Link the provider, only if still unclaimed.
        const { error: claimErr } = await admin
            .from('providers')
            .update({ claimed_by_user_id: c.user_id, claimed_at: now })
            .eq('id', c.provider_id)
            .is('claimed_by_user_id', null);
        if (claimErr) {
            return NextResponse.json({ error: claimErr.message }, { status: 500 });
        }
    }

    const { error } = await admin
        .from('provider_claims')
        .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_at: now })
        .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
