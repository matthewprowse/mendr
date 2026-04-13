import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * Weekly/daily cron: purge stale provider_cache rows, orphan cache, old anonymous quota rows.
 * Requires CRON_SECRET. Invokes RPC `run_data_layer_maintenance` (see Supabase migration).
 */
export async function GET(req: NextRequest) {
    if (!isAuthorizedCronRequest(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin.rpc('run_data_layer_maintenance');
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, result: data });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
