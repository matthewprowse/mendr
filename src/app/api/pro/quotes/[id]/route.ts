/**
 * GET   /api/pro/quotes/[id] — quote with items, customer, branding (Phase 6).
 * PATCH /api/pro/quotes/[id] — update items/fields/status; recomputes totals.
 *   VAT (15%) is applied only when the Pro is VAT-registered (provider_branding).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VAT_RATE = 0.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function resolve(id: string): Promise<{ providerId: string } | NextResponse> {
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid quote id.' }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId) return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    return { providerId };
}

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;

    const admin = await createSupabaseAdminClient();
    const { data: quote } = await admin
        .from('quotes')
        .select(
            'id, provider_id, number, status, subtotal, vat_amount, total, deposit_percent, valid_until, terms, customer_id, provider_customers(name)'
        )
        .eq('id', id)
        .maybeSingle();
    if (!quote || (quote as { provider_id: string }).provider_id !== r.providerId) {
        return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
    }

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('quote_items')
            .select('id, description, qty, unit_price, line_total, position')
            .eq('quote_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('vat_registered, vat_number')
            .eq('provider_id', r.providerId)
            .maybeSingle(),
    ]);

    return NextResponse.json({ quote, items: items ?? [], branding: branding ?? null });
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;

    const admin = await createSupabaseAdminClient();
    const { data: existing } = await admin
        .from('quotes')
        .select('provider_id, subtotal, status, sent_at, accepted_at')
        .eq('id', id)
        .maybeSingle();
    const cur = existing as
        | { provider_id: string; subtotal: number; status: string; sent_at: string | null; accepted_at: string | null }
        | null;
    if (!cur || cur.provider_id !== r.providerId) {
        return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Replace line items and recompute subtotal.
    let subtotal = Number(cur.subtotal) || 0;
    if (Array.isArray(body.items)) {
        const rows = (body.items as unknown[])
            .map((it, idx) => {
                const o = (it ?? {}) as Record<string, unknown>;
                const description = typeof o.description === 'string' ? o.description.slice(0, 500) : '';
                const qty = Number(o.qty) || 0;
                const unit = Number(o.unitPrice ?? o.unit_price) || 0;
                return {
                    quote_id: id,
                    description,
                    qty,
                    unit_price: unit,
                    line_total: round2(qty * unit),
                    position: idx,
                };
            })
            .filter((row) => row.description || row.qty || row.unit_price);
        subtotal = round2(rows.reduce((s, row) => s + row.line_total, 0));
        await admin.from('quote_items').delete().eq('quote_id', id);
        if (rows.length > 0) await admin.from('quote_items').insert(rows);
        update.subtotal = subtotal;
    }

    // VAT only when registered.
    const { data: branding } = await admin
        .from('provider_branding')
        .select('vat_registered')
        .eq('provider_id', r.providerId)
        .maybeSingle();
    const vatRegistered = Boolean((branding as { vat_registered?: boolean } | null)?.vat_registered);
    if (Array.isArray(body.items)) {
        const vat = vatRegistered ? round2(subtotal * VAT_RATE) : 0;
        update.vat_amount = vat;
        update.total = round2(subtotal + vat);
    }

    if (body.depositPercent !== undefined) {
        const d = Number(body.depositPercent);
        update.deposit_percent = Number.isFinite(d) ? d : null;
    }
    if (body.validUntil !== undefined) {
        update.valid_until = typeof body.validUntil === 'string' && body.validUntil ? body.validUntil : null;
    }
    if (body.terms !== undefined) {
        update.terms = typeof body.terms === 'string' ? body.terms.slice(0, 5000) : null;
    }
    if (body.status !== undefined) {
        if (typeof body.status !== 'string' || !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
            return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
        }
        update.status = body.status;
        if (body.status === 'sent' && !cur.sent_at) update.sent_at = new Date().toISOString();
        if (body.status === 'accepted' && !cur.accepted_at) update.accepted_at = new Date().toISOString();
    }

    const { error } = await admin.from('quotes').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
