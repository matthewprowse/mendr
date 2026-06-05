import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { formatZar } from '@/lib/format-money';
import { PrintButton } from './print-button';

export const metadata = {
    title: { absolute: 'Invoice | Mendr' },
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
type ItemRow = {
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    line_total: number | null;
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

    const provider = (Array.isArray(inv.providers) ? inv.providers[0] : inv.providers) ?? null;
    const customer =
        (Array.isArray(inv.provider_customers)
            ? inv.provider_customers[0]
            : inv.provider_customers) ?? null;
    const b = (branding ?? null) as BrandingRef | null;
    const accent = b?.accent_color || '#111827';
    const rows = (items ?? []) as ItemRow[];
    const isVat = Boolean(b?.vat_registered);
    const docTitle = isVat ? 'Tax Invoice' : 'Invoice';
    const total = Number(inv.total ?? 0);
    const paid = Number(inv.amount_paid ?? 0);
    const balance = Math.round((total - paid) * 100) / 100;

    return (
        <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
            <div className="mx-auto flex max-w-2xl flex-col gap-6 bg-white p-8 text-gray-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        {b?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={b.logo_url}
                                alt=""
                                className="mb-2 h-12 w-auto object-contain"
                            />
                        ) : null}
                        <p className="text-lg font-semibold">
                            {provider?.name ?? 'Specialist'}
                        </p>
                        {provider?.address ? (
                            <p className="text-sm text-gray-600">{provider.address}</p>
                        ) : null}
                        {provider?.phone ? (
                            <p className="text-sm text-gray-600">{provider.phone}</p>
                        ) : null}
                        {isVat && b?.vat_number ? (
                            <p className="text-sm text-gray-600">VAT {b.vat_number}</p>
                        ) : null}
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: accent }}>
                            {docTitle}
                        </p>
                        <p className="text-sm text-gray-600">{inv.number}</p>
                        <p className="text-sm text-gray-600">
                            {fmtDate(inv.issued_at ?? inv.created_at)}
                        </p>
                        {inv.due_date ? (
                            <p className="text-sm text-gray-600">Due {fmtDate(inv.due_date)}</p>
                        ) : null}
                    </div>
                </div>

                {customer?.name ? (
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Bill To
                        </p>
                        <p className="text-sm text-gray-900">{customer.name}</p>
                        {customer.phone ? (
                            <p className="text-sm text-gray-600">{customer.phone}</p>
                        ) : null}
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
                                <td className="py-2 text-right">
                                    {formatZar(Number(it.unit_price ?? 0))}
                                </td>
                                <td className="py-2 text-right">
                                    {formatZar(Number(it.line_total ?? 0))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div className="flex flex-col gap-1 self-end text-sm" style={{ minWidth: 220 }}>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal</span>
                        <span>{formatZar(Number(inv.subtotal ?? 0))}</span>
                    </div>
                    {Number(inv.vat_amount ?? 0) > 0 ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">VAT (15%)</span>
                            <span>{formatZar(Number(inv.vat_amount ?? 0))}</span>
                        </div>
                    ) : null}
                    <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
                        <span>Total</span>
                        <span style={{ color: accent }}>{formatZar(total)}</span>
                    </div>
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
                </div>

                {inv.terms ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Terms
                        </p>
                        <p className="whitespace-pre-line text-sm text-gray-700">{inv.terms}</p>
                    </div>
                ) : null}
                {b?.banking_details ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Banking Details
                        </p>
                        <p className="whitespace-pre-line text-sm text-gray-700">
                            {b.banking_details}
                        </p>
                    </div>
                ) : null}

                <div className="pt-2">
                    <PrintButton />
                </div>
            </div>
        </div>
    );
}
