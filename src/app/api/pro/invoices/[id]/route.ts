/**
 * GET   /api/pro/invoices/[id] — invoice with items + branding (Phase 7).
 * PATCH /api/pro/invoices/[id] — actions:
 *   - { action: 'issue' }            assign a gap-free number, lock, set sent
 *   - { action: 'payment', amount }  record a (partial) payment
 *   - { items, ... }                 edit, allowed only while draft
 *
 * Once issued an invoice is immutable except for recording payments.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VAT_RATE = 0.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function resolve(id: string): Promise<{ providerId: string } | NextResponse> {
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });
    }
    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const providerId = await getClaimedProviderId(user.id);
    if (!providerId)
        return NextResponse.json({ error: 'No claimed provider.' }, { status: 403 });
    return { providerId };
}

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;

    const admin = await createSupabaseAdminClient();
    const { data: invoice } = await admin
        .from('invoices')
        .select(
            'id, provider_id, number, status, subtotal, vat_amount, total, amount_paid, deposit_percent, due_date, terms, issued_at, provider_customers(name)',
        )
        .eq('id', id)
        .maybeSingle();
    if (!invoice || (invoice as { provider_id: string }).provider_id !== r.providerId) {
        return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('invoice_items')
            .select('description, qty, unit_price, position')
            .eq('invoice_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('vat_registered')
            .eq('provider_id', r.providerId)
            .maybeSingle(),
    ]);

    return NextResponse.json({ invoice, items: items ?? [], branding: branding ?? null });
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
    const { id } = await ctx.params;
    const r = await resolve(id);
    if (r instanceof NextResponse) return r;

    const admin = await createSupabaseAdminClient();
    const { data: existing } = await admin
        .from('invoices')
        .select('provider_id, status, subtotal, total, amount_paid, issued_at, number')
        .eq('id', id)
        .maybeSingle();
    const cur = existing as {
        provider_id: string;
        status: string;
        subtotal: number;
        total: number;
        amount_paid: number;
        issued_at: string | null;
        number: string | null;
    } | null;
    if (!cur || cur.provider_id !== r.providerId) {
        return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const now = new Date().toISOString();

    // --- Issue: assign gap-free number, lock, mark sent ---
    if (body.action === 'issue') {
        if (cur.issued_at) {
            return NextResponse.json({ error: 'Invoice is already issued.' }, { status: 409 });
        }
        const { data: seq, error: seqErr } = await admin.rpc('next_invoice_seq', {
            p_provider: r.providerId,
        });
        if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });
        const number = `INV-${String(seq as number).padStart(4, '0')}`;
        const { error } = await admin
            .from('invoices')
            .update({ number, issued_at: now, sent_at: now, status: 'sent', updated_at: now })
            .eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, number });
    }

    // --- Payment: record a (partial) payment ---
    if (body.action === 'payment') {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json(
                { error: 'A positive amount is required.' },
                { status: 400 },
            );
        }
        const paid = round2(Number(cur.amount_paid) + amount);
        const status = paid >= Number(cur.total) ? 'paid' : 'partial';
        const { error } = await admin
            .from('invoices')
            .update({
                amount_paid: paid,
                status,
                paid_at: status === 'paid' ? now : null,
                updated_at: now,
            })
            .eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, amount_paid: paid, status });
    }

    // --- Draft edits only ---
    if (cur.issued_at) {
        return NextResponse.json(
            { error: 'Issued invoices cannot be edited. Use a credit note.' },
            { status: 409 },
        );
    }

    const update: Record<string, unknown> = { updated_at: now };
    let subtotal = Number(cur.subtotal) || 0;
    if (Array.isArray(body.items)) {
        const rows = (body.items as unknown[])
            .map((it, idx) => {
                const o = (it ?? {}) as Record<string, unknown>;
                const description =
                    typeof o.description === 'string' ? o.description.slice(0, 500) : '';
                const qty = Number(o.qty) || 0;
                const unit = Number(o.unitPrice ?? o.unit_price) || 0;
                return {
                    invoice_id: id,
                    description,
                    qty,
                    unit_price: unit,
                    line_total: round2(qty * unit),
                    position: idx,
                };
            })
            .filter((row) => row.description || row.qty || row.unit_price);
        subtotal = round2(rows.reduce((s, row) => s + row.line_total, 0));
        await admin.from('invoice_items').delete().eq('invoice_id', id);
        if (rows.length > 0) await admin.from('invoice_items').insert(rows);

        const { data: branding } = await admin
            .from('provider_branding')
            .select('vat_registered')
            .eq('provider_id', r.providerId)
            .maybeSingle();
        const vat = (branding as { vat_registered?: boolean } | null)?.vat_registered
            ? round2(subtotal * VAT_RATE)
            : 0;
        update.subtotal = subtotal;
        update.vat_amount = vat;
        update.total = round2(subtotal + vat);
    }
    if (body.depositPercent !== undefined) {
        const d = Number(body.depositPercent);
        update.deposit_percent = Number.isFinite(d) ? d : null;
    }
    if (body.dueDate !== undefined) {
        update.due_date =
            typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null;
    }
    if (body.terms !== undefined) {
        update.terms = typeof body.terms === 'string' ? body.terms.slice(0, 5000) : null;
    }

    const { error } = await admin.from('invoices').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
