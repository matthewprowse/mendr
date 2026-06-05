'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatRelativeDate } from '@/lib/format-date';
import type { LeadStatus } from '../client';

export type EnquiryDetail = {
    id: string;
    createdAt: string;
    channel: string | null;
    status: LeadStatus;
    notes: string;
    contactNumber: string | null;
    whatsappNumber: string | null;
    title: string;
    trade: string | null;
    suburb: string;
    urgency: string | null;
    diagnosisText: string | null;
    actionRequired: string | null;
    estimatedCost: string | null;
    images: string[];
};

const STATUS_OPTIONS: LeadStatus[] = ['new', 'responded', 'quoted', 'won', 'lost'];
const STATUS_LABEL: Record<LeadStatus, string> = {
    new: 'New',
    responded: 'Responded',
    quoted: 'Quoted',
    won: 'Won',
    lost: 'Lost',
};

function titleCase(s: string | null): string {
    if (!s) return '';
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionHeader({ title }: { title: string }) {
    return <h2 className="text-lg font-semibold text-foreground">{title}</h2>;
}

async function patchLead(id: string, patch: { status?: LeadStatus; notes?: string }): Promise<boolean> {
    const res = await fetch(`/api/pro/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    }).catch(() => null);
    return Boolean(res && res.ok);
}

export default function EnquiryDetailClient({ detail }: { detail: EnquiryDetail }) {
    const router = useRouter();
    const [status, setStatus] = useState<LeadStatus>(detail.status);
    const [notes, setNotes] = useState(detail.notes);
    const [savedNotes, setSavedNotes] = useState(detail.notes);
    const [savingNotes, setSavingNotes] = useState(false);
    const [creatingQuote, setCreatingQuote] = useState(false);

    const createQuote = async () => {
        if (creatingQuote) return;
        setCreatingQuote(true);
        try {
            const res = await fetch('/api/pro/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactEventId: detail.id }),
            });
            const json = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
            if (!res.ok || !json?.id) {
                toast.error(json?.error ?? 'Could not create quote.');
                return;
            }
            router.push(`/pro/quotes/${json.id}`);
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setCreatingQuote(false);
        }
    };

    const updateStatus = async (next: LeadStatus) => {
        const prev = status;
        setStatus(next);
        if (!(await patchLead(detail.id, { status: next }))) {
            setStatus(prev);
            toast.error('Could not update status.');
        }
    };

    const saveNotes = async () => {
        if (savingNotes || notes === savedNotes) return;
        setSavingNotes(true);
        if (await patchLead(detail.id, { notes })) {
            setSavedNotes(notes);
            toast.success('Notes saved.');
        } else {
            toast.error('Could not save notes.');
        }
        setSavingNotes(false);
    };

    const meta = [titleCase(detail.trade), detail.suburb, titleCase(detail.urgency)]
        .filter(Boolean)
        .join(' · ');

    const waDigits = detail.whatsappNumber?.replace(/\D+/g, '') ?? '';
    const waText = encodeURIComponent('Hi, replying to your Mendr enquiry. How can I help?');

    return (
        <>
            <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-foreground">{detail.title}</h1>
                    <Select value={status} onValueChange={(v) => void updateStatus(v as LeadStatus)}>
                        <SelectTrigger className="h-8 w-[130px] shrink-0">
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
                </div>
                {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
                <p className="text-xs text-muted-foreground">
                    {detail.channel ? `${titleCase(detail.channel)} · ` : ''}
                    {formatRelativeDate(detail.createdAt)}
                </p>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-3">
                <SectionHeader title="Contact" />
                {detail.contactNumber ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-foreground">{detail.contactNumber}</p>
                        <div className="flex gap-2">
                            {waDigits ? (
                                <Button asChild className="flex-1">
                                    <a
                                        href={`https://wa.me/${waDigits}?text=${waText}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        WhatsApp
                                    </a>
                                </Button>
                            ) : null}
                            <Button asChild variant="secondary" className="flex-1">
                                <a href={`tel:${detail.contactNumber.replace(/\s+/g, '')}`}>Call</a>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Contact details are hidden. They appear once the homeowner shares them.
                    </p>
                )}
            </div>

            {/* Photos */}
            {detail.images.length > 0 ? (
                <div className="flex flex-col gap-3">
                    <SectionHeader title="Photos" />
                    <div className="grid grid-cols-2 gap-2">
                        {detail.images.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={url}
                                src={url}
                                alt="Homeowner enquiry"
                                className="aspect-square w-full rounded-md border object-cover"
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Diagnosis */}
            <div className="flex flex-col gap-3">
                <SectionHeader title="Diagnosis" />
                {detail.diagnosisText ? (
                    <p className="text-sm leading-relaxed text-foreground">{detail.diagnosisText}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">No diagnosis text.</p>
                )}
                {detail.actionRequired ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Recommended Action</p>
                        <p className="text-sm text-foreground">{detail.actionRequired}</p>
                    </div>
                ) : null}
                {detail.estimatedCost ? (
                    <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Estimated Cost</p>
                        <p className="text-sm text-foreground">{detail.estimatedCost}</p>
                    </div>
                ) : null}
            </div>

            {/* Private notes */}
            <div className="flex flex-col gap-3">
                <SectionHeader title="Private Notes" />
                <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Only you can see these notes."
                    rows={4}
                    maxLength={2000}
                />
                <Button
                    variant="secondary"
                    className="w-fit"
                    disabled={savingNotes || notes === savedNotes}
                    onClick={() => void saveNotes()}
                >
                    {savingNotes ? 'Saving…' : 'Save Notes'}
                </Button>
            </div>

            <Separator />

            {/* Outcome */}
            <div className="flex flex-col gap-3">
                <SectionHeader title="Outcome" />
                <Button disabled={creatingQuote} onClick={() => void createQuote()}>
                    {creatingQuote ? 'Creating…' : 'Create Quote'}
                </Button>
                <div className="flex gap-2">
                    <Button
                        className="flex-1"
                        variant={status === 'won' ? 'default' : 'secondary'}
                        onClick={() => void updateStatus('won')}
                    >
                        Mark Won
                    </Button>
                    <Button
                        className="flex-1"
                        variant={status === 'lost' ? 'default' : 'secondary'}
                        onClick={() => void updateStatus('lost')}
                    >
                        Mark Lost
                    </Button>
                </div>
            </div>
        </>
    );
}
