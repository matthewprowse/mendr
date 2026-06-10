import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { formatZar } from '@/lib/format-money';
import {
    ProviderDocument,
    UUID_RE,
    firstRef,
    fmtDate,
    type BrandingRef,
    type CustomerRef,
    type ItemRow,
    type ProviderRef,
} from '@/components/provider-document';

export const metadata = {
    title: { absolute: 'Quote | Mendr' },
    robots: { index: false, follow: false },
};

export default async function PublicQuotePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: quote } = await admin
        .from('quotes')
        .select(
            'id, provider_id, number, status, subtotal, vat_amount, total, deposit_percent, valid_until, terms, created_at, providers(name, address, phone), provider_customers(name, phone, email)',
        )
        .eq('id', id)
        .maybeSingle();

    if (!quote) notFound();

    const q = quote as {
        provider_id: string;
        number: string | null;
        subtotal: number | null;
        vat_amount: number | null;
        total: number | null;
        deposit_percent: number | null;
        valid_until: string | null;
        terms: string | null;
        created_at: string;
        providers: ProviderRef | ProviderRef[] | null;
        provider_customers: CustomerRef | CustomerRef[] | null;
    };

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('quote_items')
            .select('description, qty, unit_price, line_total, position')
            .eq('quote_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('logo_url, accent_color, banking_details, vat_registered, vat_number')
            .eq('provider_id', q.provider_id)
            .maybeSingle(),
    ]);

    // Stamp first view (best-effort).
    await admin
        .from('quotes')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', id)
        .is('viewed_at', null);

    const b = (branding ?? null) as BrandingRef | null;
    const deposit =
        q.deposit_percent != null && q.total != null
            ? (Number(q.total) * Number(q.deposit_percent)) / 100
            : null;

    return (
        <ProviderDocument
            docTitle="Quote"
            number={q.number}
            headerMeta={<p className="text-sm text-gray-600">{fmtDate(q.created_at)}</p>}
            provider={firstRef(q.providers)}
            customer={firstRef(q.provider_customers)}
            customerLabel="For"
            branding={b}
            rows={(items ?? []) as ItemRow[]}
            subtotal={Number(q.subtotal ?? 0)}
            vatAmount={Number(q.vat_amount ?? 0)}
            total={Number(q.total ?? 0)}
            totalsAfter={
                deposit != null ? (
                    <div className="flex justify-between text-gray-600">
                        <span>Deposit ({Number(q.deposit_percent)}%)</span>
                        <span>{formatZar(deposit)}</span>
                    </div>
                ) : null
            }
            belowTotals={
                q.valid_until ? (
                    <p className="text-sm text-gray-600">Valid until {fmtDate(q.valid_until)}.</p>
                ) : null
            }
            terms={q.terms}
        />
    );
}
