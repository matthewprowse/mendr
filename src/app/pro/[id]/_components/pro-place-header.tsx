'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FavouriteButton } from '@/components/favourite-button';
import { formatBusinessName } from '@/lib/utils';
import { MoreHorizontal } from 'geist-icons';

export type ProPlaceHeaderProvider = {
    name: string;
    phone: string | null;
    website: string | null;
    place_id: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    /** Slug for registered provider_profiles — used for favouriting */
    providerProfileSlug?: string | null;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Derives open/closed status and a human-readable label from Google's
 * weekday_descriptions array.
 * Exported so the provider-place-client can reuse it for the banner pill. (e.g. ["Monday: 8:00 AM – 5:00 PM", "Sunday: Closed"]).
 *
 * Returns:
 *   { open: true,  label: "Open · closes 5:00 PM" }
 *   { open: false, label: "Closed · opens Mon 8:00 AM" }
 *   null  — if hours data is unavailable or unparseable
 */
export function getOpenStatus(
    weekdayDescriptions: string[]
): { open: boolean; label: string } | null {
    if (!weekdayDescriptions?.length) return null;

    const now = new Date();
    const todayIdx = now.getDay(); // 0 = Sunday
    const todayName = DAY_NAMES[todayIdx];

    // Parse a single description line into { day, hoursText }
    const parsed = weekdayDescriptions.map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return null;
        const day = line.slice(0, colonIdx).trim();
        const hours = line.slice(colonIdx + 1).trim();
        return { day, hours };
    }).filter(Boolean) as Array<{ day: string; hours: string }>;

    if (!parsed.length) return null;

    // Find today's entry
    const todayEntry = parsed.find((p) => p.day === todayName);
    if (!todayEntry) return null;

    const hours = todayEntry.hours;

    // Closed all day
    if (/closed/i.test(hours)) {
        // Find next day that's open
        for (let offset = 1; offset <= 7; offset++) {
            const nextIdx = (todayIdx + offset) % 7;
            const nextName = DAY_NAMES[nextIdx];
            const nextEntry = parsed.find((p) => p.day === nextName);
            if (nextEntry && !/closed/i.test(nextEntry.hours)) {
                // Extract opening time — take everything before the dash/en-dash
                const openTime = nextEntry.hours.split(/[–-]/)[0].trim().replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
                const label =
                    offset === 1
                        ? `Closed · Opens tomorrow ${openTime}`
                        : `Closed · Opens ${nextName.slice(0, 3)} ${openTime}`;
                return { open: false, label };
            }
        }
        return { open: false, label: 'Closed today' };
    }

    // Hours like "8:00 AM – 5:00 PM" or "Open 24 hours"
    if (/24 hours/i.test(hours)) {
        return { open: true, label: 'Open · 24 hours' };
    }

    // Parse time range — split on en-dash, em-dash, or plain hyphen
    const parts = hours.split(/\s*[–—-]\s*/);
    if (parts.length < 2) {
        // Can't determine range — just say open
        return { open: true, label: `Open · ${hours}` };
    }

    const fmtTime = (t: string) => t.replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());

    const openStr = fmtTime(parts[0].trim());
    const closeStr = fmtTime(parts[parts.length - 1].trim());

    /** Convert "8:00 AM" / "5:00 PM" to a Date on today's date */
    const parseTime = (timeStr: string): Date | null => {
        // Handle formats: "8:00 AM", "08:00", "8 AM", etc.
        const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = m[2] ? parseInt(m[2], 10) : 0;
        const period = m[3]?.toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        const d = new Date(now);
        d.setHours(h, min, 0, 0);
        return d;
    };

    const openTime = parseTime(openStr);
    const closeTime = parseTime(closeStr);

    if (!openTime || !closeTime) {
        return { open: true, label: `Open · ${hours}` };
    }

    // If closing time is before opening time it spans midnight — adjust
    if (closeTime <= openTime) {
        closeTime.setDate(closeTime.getDate() + 1);
    }

    if (now >= openTime && now < closeTime) {
        return { open: true, label: `Open · Closes at ${closeStr}` };
    }

    if (now < openTime) {
        return { open: false, label: `Closed · Opens at ${openStr}` };
    }

    // Past closing time — find next opening
    for (let offset = 1; offset <= 7; offset++) {
        const nextIdx = (todayIdx + offset) % 7;
        const nextName = DAY_NAMES[nextIdx];
        const nextEntry = parsed.find((p) => p.day === nextName);
        if (nextEntry && !/closed/i.test(nextEntry.hours)) {
            const nextOpen = nextEntry.hours.split(/\s*[–—-]\s*/)[0].trim().replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
            const label =
                offset === 1
                    ? `Closed · Opens tomorrow ${nextOpen}`
                    : `Closed · Opens ${nextName.slice(0, 3)} ${nextOpen}`;
            return { open: false, label };
        }
    }

    return { open: false, label: 'Closed now' };
}

export function ProPlaceHeader({
    provider,
    mapsUrl: _mapsUrl,
}: {
    provider: ProPlaceHeaderProvider;
    mapsUrl: string;
    weekdayDescriptions?: string[] | null;
}) {
    const displayName = formatBusinessName(provider.name);
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [reportSubject, setReportSubject] = useState('');
    const [reportBody, setReportBody] = useState('');
    const [reportStep, setReportStep] = useState<'form' | 'submitting' | 'success' | 'error'>('form');
    const [reportErr, setReportErr] = useState<string | null>(null);

    const handleReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportSubject.trim() || !reportBody.trim()) return;
        setReportStep('submitting');
        setReportErr(null);
        try {
            const res = await fetch('/api/report-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_place_id: provider.place_id,
                    provider_name: provider.name,
                    provider_address: provider.address ?? null,
                    subject: reportSubject.trim(),
                    body: reportBody.trim(),
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Failed to submit report');
            }
            setReportStep('success');
        } catch (err) {
            setReportErr(err instanceof Error ? err.message : 'Something went wrong');
            setReportStep('error');
        }
    };

    const resetReport = () => {
        setReportSubject('');
        setReportBody('');
        setReportStep('form');
        setReportErr(null);
        setReportOpen(false);
    };

    return (
        <>
        <header className="sticky top-0 z-50 bg-background">
            <div className="mx-auto flex h-14 max-w-4xl items-center px-4 sm:px-6 lg:px-8">

                {/* Left — back button */}
                <div className="flex shrink-0 items-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="-ml-2 text-muted-foreground hover:text-foreground"
                        aria-label="Go back"
                        onClick={() => router.back()}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"/>
                            <polyline points="12 19 5 12 12 5"/>
                        </svg>
                    </Button>
                </div>

                {/* Centre — provider name */}
                <div className="min-w-0 flex-1 flex items-center justify-center px-3">
                    <p className="truncate font-semibold text-foreground" title={displayName}>
                        {displayName}
                    </p>
                </div>

                {/* Right — heart + ellipsis */}
                <div className="flex shrink-0 items-center gap-1">
                    <FavouriteButton
                        placeId={provider.place_id}
                        providerProfileSlug={provider.providerProfileSlug}
                        providerName={displayName}
                        variant="icon"
                    />
                    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="More options"
                            >
                                <MoreHorizontal size={18} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={4} className="w-52 p-2">
                            <button
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                            >
                                Report provider
                            </button>
                            <button
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() => { setMenuOpen(false); }}
                            >
                                Don&apos;t show in my results
                            </button>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </header>

        {/* Report dialog */}
        {reportOpen && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center p-4 bg-black/40" onClick={resetReport}>
                <div
                    className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                >
                    {reportStep === 'success' ? (
                        <div className="space-y-4 text-center">
                            <p className="text-base font-semibold text-foreground">Report submitted</p>
                            <p className="text-sm text-muted-foreground">
                                Thank you — we&apos;ll review your report for{' '}
                                <span className="font-medium text-foreground">{displayName}</span>.
                            </p>
                            <Button className="w-full" onClick={resetReport}>Done</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleReport} className="space-y-4">
                            <div>
                                <p className="text-base font-semibold text-foreground">Report provider</p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    Help us keep the directory accurate and trustworthy.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-foreground" htmlFor="report-subject">
                                    Reason <span className="text-destructive">*</span>
                                </label>
                                <select
                                    id="report-subject"
                                    required
                                    value={reportSubject}
                                    onChange={(e) => setReportSubject(e.target.value)}
                                    disabled={reportStep === 'submitting'}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                                >
                                    <option value="">Select a reason…</option>
                                    <option value="Scam or fraud">Scam or fraud</option>
                                    <option value="Incorrect listing">Incorrect listing</option>
                                    <option value="Out of business">Out of business</option>
                                    <option value="Offensive content">Offensive content</option>
                                    <option value="Duplicate listing">Duplicate listing</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-foreground" htmlFor="report-body">
                                    Details <span className="text-destructive">*</span>
                                </label>
                                <textarea
                                    id="report-body"
                                    required
                                    rows={3}
                                    placeholder="Tell us what happened…"
                                    value={reportBody}
                                    onChange={(e) => setReportBody(e.target.value)}
                                    disabled={reportStep === 'submitting'}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
                                />
                            </div>
                            {reportStep === 'error' && reportErr && (
                                <p className="text-sm text-destructive">{reportErr}</p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={resetReport}
                                    disabled={reportStep === 'submitting'}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={reportStep === 'submitting' || !reportSubject || !reportBody.trim()}
                                >
                                    {reportStep === 'submitting' ? 'Submitting…' : 'Submit report'}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        )}
        </>
    );
}
