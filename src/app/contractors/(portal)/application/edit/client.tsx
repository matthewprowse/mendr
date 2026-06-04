'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlowTopBar, FlowFooter, StepHeading } from '@/components/match/flow-shell';
import { PREFERRED_CONTACT_OPTIONS, RESPONSE_TIME_OPTIONS } from '../../network/steps/types';

type EditPayload = {
    applicationId: string;
    contactName: string;
    businessName: string | null;
    trade: string;
    currentSummary: string;
    geminiSummary: string | null;
    hasEdited: boolean;
    highlights: string;
    specialisations: string;
    insuranceCover: string;
    typicalResponseTime: string;
    pricingModel: string;
    calloutFee: string;
    preferredContactChannel: string;
};

type PageState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'form'; payload: EditPayload }
    | { phase: 'saved' };

const MAX_CHARS = 2000;

export default function ApplicationEditClient() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? '';

    const [state, setState] = useState<PageState>({ phase: 'loading' });
    const [summary, setSummary] = useState('');
    const [highlights, setHighlights] = useState('');
    const [specialisations, setSpecialisations] = useState('');
    const [insuranceCover, setInsuranceCover] = useState('');
    const [typicalResponseTime, setTypicalResponseTime] = useState('');
    const [pricingModel, setPricingModel] = useState('');
    const [calloutFee, setCalloutFee] = useState('');
    const [preferredContactChannel, setPreferredContactChannel] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!token) {
            setState({ phase: 'error', message: 'No token provided. Please use the link from your invitation email.' });
            return;
        }
        try {
            const res = await fetch(`/api/contractors/application/edit?token=${encodeURIComponent(token)}`);
            if (!res.ok) {
                const d = (await res.json().catch(() => ({}))) as { error?: string };
                setState({ phase: 'error', message: d.error ?? 'This link is invalid or has expired.' });
                return;
            }
            const payload = (await res.json()) as EditPayload;
            setState({ phase: 'form', payload });
            setSummary(payload.currentSummary);
            setHighlights(payload.highlights);
            setSpecialisations(payload.specialisations);
            setInsuranceCover(payload.insuranceCover);
            setTypicalResponseTime(payload.typicalResponseTime);
            setPricingModel(payload.pricingModel);
            setCalloutFee(payload.calloutFee);
            setPreferredContactChannel(payload.preferredContactChannel);
        } catch {
            setState({ phase: 'error', message: 'Something went wrong. Please try again.' });
        }
    }, [token]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleSave() {
        if (state.phase !== 'form' || !summary.trim() || saving) return;
        setSaving(true);
        try {
            const res = await fetch('/api/contractors/application/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    summary: summary.trim(),
                    highlights,
                    specialisations,
                    insuranceCover,
                    typicalResponseTime,
                    pricingModel,
                    calloutFee,
                    preferredContactChannel,
                }),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => ({}))) as { error?: string };
                toast.error(d.error ?? 'Failed to save. Please try again.');
                return;
            }
            setState({ phase: 'saved' });
        } finally {
            setSaving(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (state.phase === 'loading') {
        return (
            <div className="mx-auto max-w-xl px-6 py-20">
                <Skeleton className="mb-4 h-8 w-48" />
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (state.phase === 'error') {
        return (
            <div className="mx-auto max-w-xl px-6 py-20 text-center">
                <h1 className="text-xl font-semibold text-foreground">Link unavailable</h1>
                <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
                <p className="mt-6 text-sm text-muted-foreground">
                    If you think this is a mistake, reply to your invitation email and we will send a new link.
                </p>
            </div>
        );
    }

    if (state.phase === 'saved') {
        return (
            <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-20 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground">
                    <svg
                        className="h-6 w-6 text-background"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h1 className="text-xl font-semibold text-foreground">Profile saved</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    Your profile is updated and locked from automated changes. We will review it before it goes live.
                </p>
                <p className="mt-4 text-sm text-muted-foreground">You can close this page.</p>
            </div>
        );
    }

    const { payload } = state;
    const overLimit = summary.length > MAX_CHARS;
    const firstName = payload.contactName?.split(' ')[0] ?? '';

    return (
        <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background">
            <FlowTopBar
                centerSlot={<span className="block text-center text-lg font-bold text-foreground">Mendr</span>}
            />
            <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-6 pb-28">
                <div className="flex w-full min-w-0 max-w-xl flex-col gap-8 py-2">
                    <StepHeading
                        title="Review your profile"
                        sub={`Hi ${firstName}. This is the profile homeowners see${
                            payload.businessName ? ` for ${payload.businessName}` : ''
                        }. Edit anything below — your changes replace what we generated and won't be overwritten.`}
                    />

                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="summary-editor">Profile summary</Label>
                                <span className={`text-xs ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    {summary.length} / {MAX_CHARS}
                                </span>
                            </div>
                            <Textarea
                                id="summary-editor"
                                rows={8}
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder="Tell homeowners what you do and why they should trust you…"
                                className="text-sm leading-relaxed"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="highlights-editor">Highlights</Label>
                            <Textarea
                                id="highlights-editor"
                                rows={3}
                                value={highlights}
                                onChange={(e) => setHighlights(e.target.value)}
                                placeholder="Warranty, speed, materials — comma separated"
                                className="text-sm leading-relaxed"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="specialisations-editor">Specialisations</Label>
                            <Input
                                id="specialisations-editor"
                                value={specialisations}
                                onChange={(e) => setSpecialisations(e.target.value)}
                                placeholder="e.g. burst pipes, geysers, leak detection"
                                className="h-10 text-sm"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="insurance-editor">Insurance cover</Label>
                            <Input
                                id="insurance-editor"
                                value={insuranceCover}
                                onChange={(e) => setInsuranceCover(e.target.value)}
                                placeholder="e.g. Public liability up to R5m"
                                className="h-10 text-sm"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="response-editor">Typical response time</Label>
                            <Select value={typicalResponseTime} onValueChange={setTypicalResponseTime}>
                                <SelectTrigger
                                    id="response-editor"
                                    className="h-10 min-h-10 w-full data-[size=default]:h-10"
                                >
                                    <SelectValue placeholder="How fast do you usually respond?" />
                                </SelectTrigger>
                                <SelectContent>
                                    {RESPONSE_TIME_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="pricing-editor">Pricing model</Label>
                                <Input
                                    id="pricing-editor"
                                    value={pricingModel}
                                    onChange={(e) => setPricingModel(e.target.value)}
                                    placeholder="Fixed callout, then quoted"
                                    className="h-10 text-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="callout-editor">Call-out fee (R)</Label>
                                <Input
                                    id="callout-editor"
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    value={calloutFee}
                                    onChange={(e) => setCalloutFee(e.target.value.replace(/[^\d]/g, ''))}
                                    placeholder="450"
                                    className="h-10 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="channel-editor">Preferred contact channel</Label>
                            <Select value={preferredContactChannel} onValueChange={setPreferredContactChannel}>
                                <SelectTrigger
                                    id="channel-editor"
                                    className="h-10 min-h-10 w-full data-[size=default]:h-10"
                                >
                                    <SelectValue placeholder="How should we send you leads?" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PREFERRED_CONTACT_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </main>
            <FlowFooter className="border-t border-border">
                <Button
                    type="button"
                    className="h-10 w-full"
                    disabled={saving || !summary.trim() || overLimit}
                    onClick={() => void handleSave()}
                >
                    {saving ? 'Saving…' : 'Save and submit'}
                </Button>
            </FlowFooter>
        </div>
    );
}
