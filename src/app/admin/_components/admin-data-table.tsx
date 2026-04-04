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
        <div className="rounded-xl border border-border/50">
            <Table>
                <TableHeader className="bg-muted/30">
                    <TableRow>
                        {headers.map((h) => (
                            <TableHead key={h}>{h}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={span} className="py-12 text-center text-sm text-muted-foreground">
                                Loading…
                            </TableCell>
                        </TableRow>
                    ) : hasChildren ? (
                        children
                    ) : (
                        <TableRow>
                            <TableCell colSpan={span} className="py-12 text-center text-sm text-muted-foreground">
                                {emptyText}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
