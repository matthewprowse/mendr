/**
 * GET  /api/pro/quotes — list the Pro's quotes (Phase 6).
 * POST /api/pro/quotes — create a draft quote, optionally pre-filled from a lead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

async function resolve(): Promise<{ providerId: string } | NextResponse> {
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    return { providerId };
}

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('quotes')
        .select('id, number, status, total, valid_until, created_at, provider_customers(name)')
        .eq('provider_id', ctx.providerId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ quotes: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = (await req.json().catch(() => ({}))) as { contactEventId?: unknown };
    const contactEventId =
        typeof body.contactEventId === 'string' ? body.contactEventId.trim() : null;

    const admin = await createSupabaseAdminClient();

    // Per-Pro quote number.
    const { count } = await admin
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', ctx.providerId);
    const number = `Q-${String((count ?? 0) + 1).padStart(4, '0')}`;

    // Optional pre-fill from a lead: link the customer and seed a line item.
    let customerId: string | null = null;
    let seedDescription: string | null = null;
    if (contactEventId) {
        const { data: ev } = await admin
            .from('provider_contact_events')
            .select('provider_id, diagnoses(title, user_id)')
            .eq('id', contactEventId)
            .maybeSingle();
        const e = ev as
            | { provider_id: string; diagnoses: { title: string | null; user_id: string | null } | { title: string | null; user_id: string | null }[] | null }
            | null;
        if (e && e.provider_id === ctx.providerId) {
            const diag = Array.isArray(e.diagnoses) ? e.diagnoses[0] : e.diagnoses;
            seedDescription = diag?.title ?? null;
            if (diag?.user_id) {
                const { data: cust } = await admin
                    .from('provider_customers')
                    .select('id')
                    .eq('provider_id', ctx.providerId)
                    .eq('homeowner_user_id', diag.user_id)
                    .maybeSingle();
                customerId = (cust as { id: string } | null)?.id ?? null;
            }
        }
    }

    const { data: quote, error } = await admin
        .from('quotes')
        .insert({
            provider_id: ctx.providerId,
            number,
            customer_id: customerId,
            contact_event_id: contactEventId,
            status: 'draft',
        })
        .select('id')
        .maybeSingle();

    if (error || !quote) {
        return NextResponse.json({ error: error?.message ?? 'Could not create quote.' }, { status: 500 });
    }
    const quoteId = (quote as { id: string }).id;

    if (seedDescription) {
        await admin.from('quote_items').insert({
            quote_id: quoteId,
            description: seedDescription,
            qty: 1,
            unit_price: 0,
            line_total: 0,
            position: 0,
        });
    }

    return NextResponse.json({ id: quoteId });
}
