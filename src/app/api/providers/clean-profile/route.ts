// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { normalizeProfileTextForStorage } from '@/lib/providers/provider-profile-clean';
import { isAdminUser } from '@/lib/auth/admin-access';
import { checkRateLimit } from '@/lib/rate-limit-config';

type ProviderRow = {
    id: string;
    summary: string | null;
    summary_long: string | null;
    about: string | null;
    past_work: string | null;
};

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'providerCleanProfile');
    if (limited) return limited;

    // Finding H5: this mutates arbitrary provider copy by id/place id. It is a
    // maintenance utility with no end-user call site, so restrict it to admins.
    if (!(await isAdminUser())) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const providerId =
            typeof body?.providerId === 'string' ? body.providerId.trim() : '';
        const googlePlaceId =
            typeof body?.googlePlaceId === 'string' ? body.googlePlaceId.trim() : '';

        if (!providerId && !googlePlaceId) {
            return NextResponse.json(
                { error: 'providerId or googlePlaceId is required' },
                { status: 400 }
            );
        }

        const admin = await createSupabaseAdminClient();
        let query = admin
            .from('providers')
            .select('id,summary,summary_long,about,past_work')
            .limit(1);

        if (providerId) query = query.eq('id', providerId);
        else query = query.eq('google_place_id', googlePlaceId);

        const { data, error } = await query.maybeSingle();
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        const row = data as ProviderRow;
        const nextSummary = normalizeProfileTextForStorage(row.summary);
        const nextSummaryLong = normalizeProfileTextForStorage(row.summary_long);
        const nextAbout = normalizeProfileTextForStorage(row.about);
        const nextPastWork = normalizeProfileTextForStorage(row.past_work);

        const currentSummary = row.summary?.trim() || null;
        const currentSummaryLong = row.summary_long?.trim() || null;
        const currentAbout = row.about?.trim() || null;
        const currentPastWork = row.past_work?.trim() || null;

        const updates: Partial<ProviderRow> = {};
        if (nextSummary !== currentSummary) updates.summary = nextSummary;
        if (nextSummaryLong !== currentSummaryLong) updates.summary_long = nextSummaryLong;
        if (nextAbout !== currentAbout) updates.about = nextAbout;
        if (nextPastWork !== currentPastWork) updates.past_work = nextPastWork;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ ok: true, updated: false });
        }

        const { error: updateError } = await admin
            .from('providers')
            .update(updates)
            .eq('id', row.id);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, updated: true, providerId: row.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to clean provider profile';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

