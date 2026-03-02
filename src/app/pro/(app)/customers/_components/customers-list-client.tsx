'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Customer = { id: string; name: string };

export function CustomersListClient({ customers }: { customers: Customer[] }) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
                <p className="text-muted-foreground text-sm">
                    Customers you have worked with.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All customers</CardTitle>
                </CardHeader>
                <CardContent>
                    {customers.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">
                            No customers yet.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {customers.map((c) => (
                                <li key={c.id}>
                                    <Link
                                        href={`/pro/customers/${c.id}`}
                                        className="block py-4 font-medium transition-colors hover:bg-muted/50"
                                    >
                                        {c.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
