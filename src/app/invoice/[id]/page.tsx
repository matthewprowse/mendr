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
    title: { absolute: 'Invoice | Mendr' },
    robots: { index: false, follow: false },
};

export default async function PublicInvoicePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    if (!UUID_RE.test(id)) notFound();

    const admin = await createSupabaseAdminClient();
    const { data: invoice } = await admin
        .from('invoices')
        .select(
            'id, provider_id, number, status, subtotal, vat_amount, total, amount_paid, deposit_percent, due_date, terms, issued_at, created_at, providers(name, address, phone), provider_customers(name, phone, email)',
        )
        .eq('id', id)
        .maybeSingle();

    if (!invoice) notFound();

    const inv = invoice as {
        provider_id: string;
        number: string | null;
        subtotal: number | null;
        vat_amount: number | null;
        total: number | null;
        amount_paid: number | null;
        deposit_percent: number | null;
        due_date: string | null;
        terms: string | null;
        issued_at: string | null;
        created_at: string;
        providers: ProviderRef | ProviderRef[] | null;
        provider_customers: CustomerRef | CustomerRef[] | null;
    };

    // Drafts are not publicly viewable.
    if (!inv.issued_at) notFound();

    const [{ data: items }, { data: branding }] = await Promise.all([
        admin
            .from('invoice_items')
            .select('description, qty, unit_price, line_total, position')
            .eq('invoice_id', id)
            .order('position', { ascending: true }),
        admin
            .from('provider_branding')
            .select('logo_url, accent_color, banking_details, vat_registered, vat_number')
            .eq('provider_id', inv.provider_id)
            .maybeSingle(),
    ]);

    const b = (branding ?? null) as BrandingRef | null;
    const total = Number(inv.total ?? 0);
    const paid = Number(inv.amount_paid ?? 0);
    const balance = Math.round((total - paid) * 100) / 100;

    return (
        <ProviderDocument
            docTitle={b?.vat_registered ? 'Tax Invoice' : 'Invoice'}
            number={inv.number}
            headerMeta={
                <>
                    <p className="text-sm text-gray-600">
                        {fmtDate(inv.issued_at ?? inv.created_at)}
                    </p>
                    {inv.due_date ? (
                        <p className="text-sm text-gray-600">Due {fmtDate(inv.due_date)}</p>
                    ) : null}
                </>
            }
            provider={firstRef(inv.providers)}
            customer={firstRef(inv.provider_customers)}
            customerLabel="Bill To"
            branding={b}
            rows={(items ?? []) as ItemRow[]}
            subtotal={Number(inv.subtotal ?? 0)}
            vatAmount={Number(inv.vat_amount ?? 0)}
            total={total}
            totalsAfter={
                <>
                    {paid > 0 ? (
                        <div className="flex justify-between text-gray-600">
                            <span>Paid</span>
                            <span>{formatZar(paid)}</span>
                        </div>
                    ) : null}
                    <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
                        <span>Balance Due</span>
                        <span>{formatZar(balance)}</span>
                    </div>
                </>
            }
            terms={inv.terms}
        />
    );
}
