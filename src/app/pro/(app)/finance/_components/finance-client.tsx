'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Row = {
    id: string;
    customerName: string;
    date: string;
    total: number;
    is_paid: boolean;
    payment_proof_url: string | null;
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function FinanceClient({ rows }: { rows: Row[] }) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
                <p className="text-muted-foreground text-sm">
                    Completed jobs and payment status.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Completed jobs</CardTitle>
                </CardHeader>
                <CardContent>
                    {rows.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">
                            No completed jobs yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="pb-2 font-medium">Customer</th>
                                        <th className="pb-2 font-medium">Date</th>
                                        <th className="pb-2 font-medium">Total</th>
                                        <th className="pb-2 font-medium">Paid</th>
                                        <th className="pb-2 font-medium">Proof</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.id} className="border-b border-border">
                                            <td className="py-2">
                                                <Link
                                                    href={`/pro/jobs/${r.id}`}
                                                    className="text-primary hover:underline"
                                                >
                                                    {r.customerName}
                                                </Link>
                                            </td>
                                            <td className="text-muted-foreground py-2">
                                                {formatDate(r.date)}
                                            </td>
                                            <td className="py-2">{formatCurrency(r.total)}</td>
                                            <td className="py-2">{r.is_paid ? 'Yes' : 'No'}</td>
                                            <td className="py-2">
                                                {r.payment_proof_url ? (
                                                    <a
                                                        href={r.payment_proof_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary text-xs underline"
                                                    >
                                                        View
                                                    </a>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-muted-foreground mt-4 text-sm">
                        Toggle is_paid and upload payment proof via Job page or a dedicated action (Phase 4.6).
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
