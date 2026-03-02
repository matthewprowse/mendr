'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Product = {
    id: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    sort_order: number;
    active: boolean;
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}

export function ProductsClient({
    products: initialProducts,
    maxProducts,
}: {
    products: Product[];
    maxProducts: number;
}) {
    const [products, setProducts] = useState(initialProducts);

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
                <p className="text-muted-foreground text-sm">
                    Your catalog ({products.length} / {maxProducts}).
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Catalog</CardTitle>
                </CardHeader>
                <CardContent>
                    {products.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">
                            No products yet. Add your first product below (or in Claim wizard).
                        </p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {products.map((p) => (
                                <li key={p.id} className="flex items-center justify-between py-3">
                                    <div>
                                        <p className="font-medium">{p.name}</p>
                                        {p.description && (
                                            <p className="text-muted-foreground text-sm">{p.description}</p>
                                        )}
                                        <p className="text-muted-foreground text-xs">
                                            {formatCurrency(p.price)} / {p.unit}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-muted-foreground mt-4 text-sm">
                        Full CRUD and plan-limit enforcement can be added (e.g. API route for create/update/delete).
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
