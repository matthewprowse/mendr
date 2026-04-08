'use client';

import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AdminDataTableProps = {
    headers: string[];
    loading: boolean;
    emptyText: string;
    colSpan?: number;
    children: ReactNode;
};

export function AdminDataTable({
    headers,
    loading,
    emptyText,
    colSpan,
    children,
}: AdminDataTableProps) {
    const span = colSpan ?? headers.length;
    const hasChildren = Boolean(children);

    return (
        <div className="rounded-md border">
            <Table className="[&_th]:h-12 [&_th]:px-4 [&_td]:px-4 [&_td]:py-3">
                <TableHeader>
                    <TableRow>
                        {headers.map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={span} className="h-24 text-center text-sm text-muted-foreground">
                                Loading…
                            </TableCell>
                        </TableRow>
                    ) : hasChildren ? (
                        children
                    ) : (
                        <TableRow>
                            <TableCell colSpan={span} className="h-24 text-center text-sm text-muted-foreground">
                                {emptyText}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
