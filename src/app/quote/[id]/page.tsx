import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { formatZar } from '@/lib/format-money';
import { PrintButton } from './print-button';

export const metadata = {
    title: { absolute: 'Quote | Mendr' },
    robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ProviderRef = { name: string | null; address: string | null; phone: string | null };
type CustomerRef = { name: string | null; phone: string | null; email: string | null };
type BrandingRef = {
    logo_url: string | null;
    accent_color: string | null;
    banking_details: string | null;
    vat_registered: boolean | null;
    vat_number: string | null;
};
type ItemRow = { description: string | null; qty: number | null; unit_price: number | null; line_total: number | null };

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
            'id, provider_id, number, status, subtotal, vat_amount, total, deposit_percent, valid_until, terms, created_at, providers(name, address, phone), provider_customers(name, phone, email)'
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
    await admin.from('quotes').update({ viewed_at: new Date().toISOString() }).eq('id', id).is('viewed_at', null);

    const provider = (Array.isArray(q.providers) ? q.providers[0] : q.providers) ?? null;
    const customer = (Array.isArray(q.provider_customers) ? q.provider_customers[0] : q.provider_customers) ?? null;
    const b = (branding ?? null) as BrandingRef | null;
    const accent = b?.accent_color || '#111827';
    const rows = (items ?? []) as ItemRow[];
    const deposit =
        q.deposit_percent != null && q.total != null
            ? (Number(q.total) * Number(q.deposit_percent)) / 100
            : null;

    return (
        <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
            <div className="mx-auto flex max-w-2xl flex-col gap-6 bg-white p-8 text-gray-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        {b?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.logo_url} alt="" className="mb-2 h-12 w-auto object-contain" />
                        ) : null}
                        <p className="text-lg font-semibold">{provider?.name ?? 'Specialist'}</p>
                        {provider?.address ? (
                            <p className="text-sm text-gray-600">{provider.address}</p>
                        ) : null}
                        {provider?.phone ? <p className="text-sm text-gray-600">{provider.phone}</p> : null}
                        {b?.vat_registered && b.vat_number ? (
                            <p className="text-sm text-gray-600">VAT {b.vat_number}</p>
                        ) : null}
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: accent }}>
                            Quote
                        </p>
                        <p className="text-sm text-gray-600">{q.number}</p>
                        <p className="text-sm text-gray-600">{fmtDate(q.created_at)}</p>
                    </div>
                </div>

                {customer?.name ? (
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">For</p>
                        <p className="text-sm text-gray-900">{customer.name}</p>
                        {customer.phone ? <p className="text-sm text-gray-600">{customer.phone}</p> : null}
                    </div>
                ) : null}

                {/* Items */}
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-500">
                            <th className="py-2 font-medium">Description</th>
                            <th className="py-2 text-right font-medium">Qty</th>
                            <th className="py-2 text-right font-medium">Unit</th>
                            <th className="py-2 text-right font-medium">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((it, i) => (
                            <tr key={i} className="border-b border-gray-100">
                                <td className="py-2">{it.description}</td>
                                <td className="py-2 text-right">{Number(it.qty ?? 0)}</td>
                                <td className="py-2 text-right">{formatZar(Number(it.unit_price ?? 0))}</td>
                                <td className="py-2 text-right">{formatZar(Number(it.line_total ?? 0))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="flex flex-col gap-1 self-end text-sm" style={{ minWidth: 220 }}>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal</span>
                        <span>{formatZar(Number(q.subtotal ?? 0))}</span>
                    </div>
                    {Number(q.vat_amount ?? 0) > 0 ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">VAT (15%)</span>
                            <span>{formatZar(Number(q.vat_amount ?? 0))}</span>
                        </div>
                    ) : null}
                    <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
                        <span>Total</span>
                        <span style={{ color: accent }}>{formatZar(Number(q.total ?? 0))}</span>
                    </div>
                    {deposit != null ? (
                        <div className="flex justify-between text-gray-600">
                            <span>Deposit ({Number(q.deposit_percent)}%)</span>
                            <span>{formatZar(deposit)}</span>
                        </div>
                    ) : null}
                </div>

                {q.valid_until ? (
                    <p className="text-sm text-gray-600">Valid until {fmtDate(q.valid_until)}.</p>
                ) : null}
                {q.terms ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Terms</p>
                        <p className="whitespace-pre-line text-sm text-gray-700">{q.terms}</p>
                    </div>
                ) : null}
                {b?.banking_details ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Banking Details
                        </p>
                        <p className="whitespace-pre-line text-sm text-gray-700">{b.banking_details}</p>
                    </div>
                ) : null}

                <div className="pt-2">
                    <PrintButton />
                </div>
            </div>
        </div>
    );
}
