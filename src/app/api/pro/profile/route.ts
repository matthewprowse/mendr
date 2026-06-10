/**
 * GET   /api/pro/profile — the editable profile fields for the claimed provider.
 * PATCH /api/pro/profile — update those fields (owner / admin only).
 *
 * Mirrors the ownership pattern in /api/pro/settings. Every written column is
 * stamped in `providers.field_sources` as 'contractor' so the Google enrichment
 * pipeline never overwrites the Pro's own words (same contract as the
 * onboarding promotion step in /api/pro/application/edit).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import {
    getClaimedProviderId,
    getProviderRole,
    type ProviderRole,
} from '@/lib/providers/claimed-provider';
import { sanitizeProfileText } from '@/lib/providers/provider-profile-clean';

const PROFILE_COLUMNS =
    'name, summary_long, about, past_work, website, phone, highlights, specialisations, years_in_business';

async function resolve(): Promise<
    { providerId: string; userId: string; role: ProviderRole } | NextResponse
> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId)
        return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    const role = await getProviderRole(user.id, providerId);
    if (!role) return NextResponse.json({ error: 'Not on this team.' }, { status: 403 });
    return { providerId, userId: user.id, role };
}

function toStringArray(value: unknown, maxItems = 12, maxLen = 80): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems)
        .map((v) => v.slice(0, maxLen));
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data } = await admin
        .from('providers')
        .select(PROFILE_COLUMNS)
        .eq('id', ctx.providerId)
        .maybeSingle();

    const p = (data ?? {}) as Record<string, unknown>;
    return NextResponse.json({
        role: ctx.role,
        profile: {
            name: (p.name as string | null) ?? null,
            summary_long: (p.summary_long as string | null) ?? null,
            about: (p.about as string | null) ?? null,
            past_work: (p.past_work as string | null) ?? null,
            website: (p.website as string | null) ?? null,
            phone: (p.phone as string | null) ?? null,
            highlights: Array.isArray(p.highlights) ? (p.highlights as string[]) : [],
            specialisations: Array.isArray(p.specialisations)
                ? (p.specialisations as string[])
                : [],
            years_in_business:
                typeof p.years_in_business === 'number' ? p.years_in_business : null,
        },
    });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
        return NextResponse.json(
            { error: 'Only owners and admins can edit the business profile.' },
            { status: 403 },
        );
    }

    const body = (await req.json().catch(() => ({}))) as { profile?: Record<string, unknown> };
    const p = body.profile;
    if (!p || typeof p !== 'object') {
        return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    const stamped: string[] = [];
    const stamp = (key: string, value: unknown) => {
        update[key] = value;
        stamped.push(key);
    };

    // Verified business name — only write a non-empty value (never blank it out).
    if (typeof p.name === 'string') {
        const name = p.name.trim().slice(0, 200);
        if (name) stamp('name', name);
    }

    // Prose — sanitise and skip when empty, so a blank submit never wipes enrichment.
    for (const key of ['summary_long', 'about', 'past_work'] as const) {
        if (typeof p[key] === 'string') {
            const clean = sanitizeProfileText(p[key] as string);
            if (clean) stamp(key, clean);
        }
    }

    // Contact — trim; an empty string clears the field.
    if (typeof p.website === 'string') stamp('website', p.website.trim().slice(0, 300) || null);
    if (typeof p.phone === 'string') stamp('phone', p.phone.trim().slice(0, 40) || null);

    // Tag arrays — text[] columns; an empty array clears them.
    if (p.highlights !== undefined) stamp('highlights', toStringArray(p.highlights));
    if (p.specialisations !== undefined) stamp('specialisations', toStringArray(p.specialisations));

    // Years in business — 0..200 or null.
    if (p.years_in_business !== undefined) {
        const n = Number(p.years_in_business);
        stamp(
            'years_in_business',
            Number.isFinite(n) && n >= 0 && n <= 200 ? Math.floor(n) : null,
        );
    }

    if (stamped.length === 0) {
        return NextResponse.json({ ok: true });
    }

    const admin = await createSupabaseAdminClient();

    // Merge provenance so enrichment never overwrites contractor edits.
    const { data: existing } = await admin
        .from('providers')
        .select('field_sources')
        .eq('id', ctx.providerId)
        .maybeSingle();
    const mergedSources: Record<string, string> = {
        ...(((existing as { field_sources?: Record<string, string> | null } | null)
            ?.field_sources) ?? {}),
    };
    for (const key of stamped) mergedSources[key] = 'contractor';

    const { error } = await admin
        .from('providers')
        .update({ ...update, field_sources: mergedSources, updated_at: new Date().toISOString() })
        .eq('id', ctx.providerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
