'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export type LeadStatus = 'new' | 'responded' | 'quoted' | 'won' | 'lost';

export type LeadRow = {
    id: string;
    createdAt: string;
    channel: string | null;
    trade: string | null;
    title: string | null;
    suburb: string;
    status: LeadStatus;
    contact: string | null;
};

const STATUS_OPTIONS: LeadStatus[] = ['new', 'responded', 'quoted', 'won', 'lost'];
const STATUS_LABEL: Record<LeadStatus, string> = {
    new: 'New',
    responded: 'Responded',
    quoted: 'Quoted',
    won: 'Won',
    lost: 'Lost',
};

const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: 'WhatsApp',
    phone: 'Phone',
    email: 'Email',
};

function ageOf(iso: string): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const days = Math.floor(Math.max(0, Date.now() - t) / 86_400_000);
    if (days < 1) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function titleCase(s: string | null): string {
    if (!s) return '';
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadsClient({ rows }: { rows: LeadRow[] }) {
    const [items, setItems] = useState<LeadRow[]>(rows);

    const setStatus = async (id: string, status: LeadStatus) => {
        const prev = items;
        setItems((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
        const res = await fetch(`/api/pro/leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        }).catch(() => null);
        if (!res || !res.ok) {
            setItems(prev);
            toast.error('Could not update status. Please try again.');
        }
    };

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
                <p className="text-sm text-muted-foreground">
                    Every homeowner who has contacted you. Update the status as you work each lead.
                </p>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
            ) : (
                <div className="flex flex-col">
                    {items.map((row, i) => {
                        const meta = [
                            titleCase(row.trade),
                            row.suburb,
                            row.channel ? CHANNEL_LABEL[row.channel] ?? row.channel : '',
                        ]
                            .filter(Boolean)
                            .join(' · ');
                        return (
                            <Fragment key={row.id}>
                                {i > 0 && <Separator />}
                                <div className="flex items-center gap-3 py-3">
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {row.title || titleCase(row.trade) || 'New Enquiry'}
                                        </p>
                                        {meta ? (
                                            <p className="truncate text-xs text-muted-foreground">{meta}</p>
                                        ) : null}
                                        {row.contact ? (
                                            <a
                                                href={`tel:${row.contact.replace(/\s+/g, '')}`}
                                                className="text-xs text-foreground underline-offset-2 hover:underline"
                                            >
                                                {row.contact}
                                            </a>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3">
                                        <Select
                                            value={row.status}
                                            onValueChange={(v) => void setStatus(row.id, v as LeadStatus)}
                                        >
                                            <SelectTrigger className="h-8 w-[130px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {STATUS_OPTIONS.map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                        {STATUS_LABEL[s]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                                            {ageOf(row.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </Fragment>
                        );
                    })}
                </div>
            )}
        </>
    );
}
