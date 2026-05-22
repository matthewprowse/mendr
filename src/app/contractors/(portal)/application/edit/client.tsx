'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type EditPayload = {
    applicationId:  string;
    contactName:    string;
    businessName:   string | null;
    trade:          string;
    currentSummary: string;
    geminiSummary:  string | null;
    hasEdited:      boolean;
};

type PageState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'form'; payload: EditPayload }
    | { phase: 'saved' };

export default function ApplicationEditClient() {
    const searchParams = useSearchParams();
    const token        = searchParams.get('token') ?? '';

    const [state,   setState]   = useState<PageState>({ phase: 'loading' });
    const [summary, setSummary] = useState('');
    const [saving,  setSaving]  = useState(false);
    const [charCount, setCharCount] = useState(0);

    const MAX_CHARS = 2000;

    const load = useCallback(async () => {
        if (!token) {
            setState({ phase: 'error', message: 'No token provided. Please use the link from your invitation email.' });
            return;
        }
        try {
            const res = await fetch(`/api/contractors/application/edit?token=${encodeURIComponent(token)}`);
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { error?: string };
                setState({ phase: 'error', message: d.error ?? 'This link is invalid or has expired.' });
                return;
            }
            const payload = await res.json() as EditPayload;
            setState({ phase: 'form', payload });
            setSummary(payload.currentSummary);
            setCharCount(payload.currentSummary.length);
        } catch {
            setState({ phase: 'error', message: 'Something went wrong. Please try again.' });
        }
    }, [token]);

    useEffect(() => { void load(); }, [load]);

    async function handleSave() {
        if (state.phase !== 'form' || !summary.trim() || saving) return;
        setSaving(true);
        try {
            const res = await fetch('/api/contractors/application/edit', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ token, summary: summary.trim() }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { error?: string };
                alert(d.error ?? 'Failed to save. Please try again.');
                return;
            }
            setState({ phase: 'saved' });
        } finally {
            setSaving(false);
        }
    }

    function handleReset() {
        if (state.phase !== 'form') return;
        const orig = state.payload.geminiSummary ?? '';
        setSummary(orig);
        setCharCount(orig.length);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (state.phase === 'loading') {
        return (
            <div className="mx-auto max-w-xl px-4 py-20">
                <Skeleton className="mb-4 h-8 w-48" />
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (state.phase === 'error') {
        return (
            <div className="mx-auto max-w-xl px-4 py-20 text-center">
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
            <div className="mx-auto max-w-xl px-4 py-20 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h1 className="text-xl font-semibold text-foreground">Profile saved</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                    Your profile summary has been saved. We will review it and let you know when your profile is live.
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                    You can close this page.
                </p>
            </div>
        );
    }

    const { payload } = state;

    return (
        <div className="mx-auto max-w-xl px-4 py-16">
            {/* Header */}
            <div className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mendr</p>
                <h1 className="mt-2 text-2xl font-bold text-foreground">Review your profile</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Hi {payload.contactName.split(' ')[0]}. Below is the profile summary we put together
                    {payload.businessName ? ` for ${payload.businessName}` : ''} based on your application.
                    Read through it, make any changes, and save when you are happy.
                </p>
            </div>

            {/* Context strip */}
            <div className="mb-6 flex gap-4 rounded-lg border border-border/50 bg-muted/20 p-4 text-sm">
                {payload.businessName && (
                    <div>
                        <p className="text-xs text-muted-foreground">Business</p>
                        <p className="font-medium text-foreground">{payload.businessName}</p>
                    </div>
                )}
                <div>
                    <p className="text-xs text-muted-foreground">Trade</p>
                    <p className="font-medium text-foreground">{payload.trade}</p>
                </div>
            </div>

            {/* Summary editor */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground" htmlFor="summary-editor">
                        Profile summary
                    </label>
                    <span className={`text-xs ${charCount > MAX_CHARS ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {charCount} / {MAX_CHARS}
                    </span>
                </div>
                <Textarea
                    id="summary-editor"
                    rows={10}
                    value={summary}
                    onChange={(e) => {
                        setSummary(e.target.value);
                        setCharCount(e.target.value.length);
                    }}
                    placeholder="Your profile summary..."
                    className="text-sm leading-relaxed"
                />
                {payload.hasEdited && (
                    <p className="text-xs text-muted-foreground">
                        You have previously saved edits. The text above reflects your last saved version.
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                    onClick={() => void handleSave()}
                    disabled={saving || !summary.trim() || charCount > MAX_CHARS}
                    className="flex-1"
                >
                    {saving ? 'Saving...' : 'Save and submit'}
                </Button>
                {payload.geminiSummary && summary !== payload.geminiSummary && (
                    <Button variant="outline" onClick={handleReset} disabled={saving}>
                        Reset to original
                    </Button>
                )}
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
                Once you save, your profile will be reviewed by our team before going live.
                If you need to make further changes, reply to your invitation email.
            </p>
        </div>
    );
}
