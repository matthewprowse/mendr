import type { ReactNode } from 'react';
import { formatZar } from '@/lib/format-money';
import { PrintButton } from '@/components/print-button';

// Shared print-friendly layout for public provider documents (invoice, quote).
// Document-specific bits (extra totals rows, footnotes) come in via slots.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fmtDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type ProviderRef = { name: string | null; address: string | null; phone: string | null };
export type CustomerRef = { name: string | null; phone: string | null; email: string | null };
export type BrandingRef = {
    logo_url: string | null;
    accent_color: string | null;
    banking_details: string | null;
    vat_registered: boolean | null;
    vat_number: string | null;
};
export type ItemRow = {
    description: string | null;
    qty: number | null;
    unit_price: number | null;
    line_total: number | null;
};

/** Supabase embeds can come back as a single row or an array; take the first. */
export function firstRef<T>(value: T | T[] | null): T | null {
    return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function ProviderDocument({
    docTitle,
    number,
    headerMeta,
    provider,
    customer,
    customerLabel,
    branding,
    rows,
    subtotal,
    vatAmount,
    total,
    totalsAfter,
    belowTotals,
    terms,
}: {
    docTitle: string;
    number: string | null;
    /** Date / due-date lines under the document number. */
    headerMeta: ReactNode;
    provider: ProviderRef | null;
    customer: CustomerRef | null;
    customerLabel: string;
    branding: BrandingRef | null;
    rows: ItemRow[];
    subtotal: number;
    vatAmount: number;
    total: number;
    /** Extra rows rendered after the Total row (e.g. Paid/Balance, Deposit). */
    totalsAfter?: ReactNode;
    /** Content between totals and terms (e.g. "Valid until"). */
    belowTotals?: ReactNode;
    terms: string | null;
}) {
    const b = branding;
    const accent = b?.accent_color || '#111827';
    const showVatNumber = Boolean(b?.vat_registered && b.vat_number);

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
                        <p className="text-lg font-semibold">{provider?.name ?? 'Specialist'}</p>
                        {provider?.address ? (
                            <p className="text-sm text-gray-600">{provider.address}</p>
                        ) : null}
                        {provider?.phone ? (
                            <p className="text-sm text-gray-600">{provider.phone}</p>
                        ) : null}
                        {showVatNumber ? (
                            <p className="text-sm text-gray-600">VAT {b?.vat_number}</p>
                        ) : null}
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold" style={{ color: accent }}>
                            {docTitle}
                        </p>
                        <p className="text-sm text-gray-600">{number}</p>
                        {headerMeta}
                    </div>
                </div>

                {customer?.name ? (
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            {customerLabel}
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
                        <span>{formatZar(subtotal)}</span>
                    </div>
                    {vatAmount > 0 ? (
                        <div className="flex justify-between">
                            <span className="text-gray-500">VAT (15%)</span>
                            <span>{formatZar(vatAmount)}</span>
                        </div>
                    ) : null}
                    <div className="flex justify-between border-t border-gray-300 pt-1 font-semibold">
                        <span>Total</span>
                        <span style={{ color: accent }}>{formatZar(total)}</span>
                    </div>
                    {totalsAfter}
                </div>

                {belowTotals}
                {terms ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Terms
                        </p>
                        <p className="whitespace-pre-line text-sm text-gray-700">{terms}</p>
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
