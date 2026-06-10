/**
 * GET  /api/pro/invoices — list the Pro's invoices (Phase 7).
 * POST /api/pro/invoices — create a draft invoice, optionally from an accepted
 *      quote (copies the customer, items, and totals).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';
import { getClaimedProviderId } from '@/lib/providers/claimed-provider';

async function resolve(): Promise<{ providerId: string } | NextResponse> {
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

export async function GET(): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const admin = await createSupabaseAdminClient();
    const { data, error } = await admin
        .from('invoices')
        .select(
            'id, number, status, total, amount_paid, due_date, created_at, provider_customers(name)',
        )
        .eq('provider_id', ctx.providerId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invoices: data ?? [] });
}

type QuoteItem = {
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    line_total: number | null;
    position: number;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ctx = await resolve();
    if (ctx instanceof NextResponse) return ctx;

    const body = (await req.json().catch(() => ({}))) as { quoteId?: unknown };
    const quoteId = typeof body.quoteId === 'string' ? body.quoteId.trim() : null;

    const admin = await createSupabaseAdminClient();

    let customerId: string | null = null;
    let subtotal = 0;
    let vatAmount = 0;
    let total = 0;
    let depositPercent: number | null = null;
    let terms: string | null = null;
    let items: QuoteItem[] = [];

    if (quoteId) {
        const { data: quote } = await admin
            .from('quotes')
            .select(
                'provider_id, customer_id, subtotal, vat_amount, total, deposit_percent, terms',
            )
            .eq('id', quoteId)
            .maybeSingle();
        const q = quote as {
            provider_id: string;
            customer_id: string | null;
            subtotal: number | null;
            vat_amount: number | null;
            total: number | null;
            deposit_percent: number | null;
            terms: string | null;
        } | null;
        if (!q || q.provider_id !== ctx.providerId) {
            return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
        }
        customerId = q.customer_id;
        subtotal = Number(q.subtotal ?? 0);
        vatAmount = Number(q.vat_amount ?? 0);
        total = Number(q.total ?? 0);
        depositPercent = q.deposit_percent;
        terms = q.terms;
        const { data: qItems } = await admin
            .from('quote_items')
            .select('description, qty, unit_price, line_total, position')
            .eq('quote_id', quoteId)
            .order('position', { ascending: true });
        items = (qItems ?? []) as QuoteItem[];
    }

    const { data: invoice, error } = await admin
        .from('invoices')
        .insert({
            provider_id: ctx.providerId,
            quote_id: quoteId,
            customer_id: customerId,
            status: 'draft',
            subtotal,
            vat_amount: vatAmount,
            total,
            deposit_percent: depositPercent,
            terms,
        })
        .select('id')
        .maybeSingle();

    if (error || !invoice) {
        return NextResponse.json(
            { error: error?.message ?? 'Could not create invoice.' },
            { status: 500 },
        );
    }
    const invoiceId = (invoice as { id: string }).id;

    if (items.length > 0) {
        await admin.from('invoice_items').insert(
            items.map((it, idx) => ({
                invoice_id: invoiceId,
                description: it.description,
                qty: Number(it.qty ?? 0),
                unit_price: Number(it.unit_price ?? 0),
                line_total: Number(it.line_total ?? 0),
                position: idx,
            })),
        );
    }

    return NextResponse.json({ id: invoiceId });
}
