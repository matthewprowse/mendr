'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { toast } from 'sonner';

type SharedSpecialist = { provider_id: string; name: string };

export type ConsentState = { product_analytics: boolean; model_training: boolean };

const CONSENT_ROWS: { id: keyof ConsentState; label: string }[] = [
    { id: 'product_analytics', label: 'Product Analytics' },
    { id: 'model_training',    label: "Help Improve Mendr's AI" },
];

const EXPORT_ITEMS = [
    'Profile',
    'Requests',
    'Saved Contractors',
    'Addresses',
    'Contact History',
];

export default function PrivacyClient({ initialConsent }: { initialConsent?: ConsentState }) {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [consent, setConsent] = useState<ConsentState | null>(initialConsent ?? null);
    const [exporting, setExporting] = useState(false);

    // Lead-share consent (Phase 3): global mode + the specialists shared with.
    const [shareMode, setShareMode] = useState<'ask_each_time' | 'always_share' | null>(null);
    const [shares, setShares] = useState<SharedSpecialist[] | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    useEffect(() => {
        if (initialConsent !== undefined) return; // server already provided data
        if (!isLoggedIn) return;
        fetch('/api/account/data-consent')
            .then(r => r.ok ? r.json() : null)
            .then((data: ConsentState | null) => { if (data) setConsent(data); })
            .catch(() => null);
    }, [isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isLoggedIn) return;
        fetch('/api/account/consent-settings')
            .then(r => (r.ok ? r.json() : null))
            .then((d: { mode?: 'ask_each_time' | 'always_share' } | null) =>
                setShareMode(d?.mode ?? 'ask_each_time'))
            .catch(() => setShareMode('ask_each_time'));
        fetch('/api/account/consents')
            .then(r => (r.ok ? r.json() : null))
            .then((d: { specialists?: SharedSpecialist[] } | null) => setShares(d?.specialists ?? []))
            .catch(() => setShares([]));
    }, [isLoggedIn]);

    const toggleShareMode = async () => {
        const next = shareMode === 'always_share' ? 'ask_each_time' : 'always_share';
        setShareMode(next);
        await fetch('/api/account/consent-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: next }),
        }).catch(() => {});
    };

    const revokeShare = async (providerId: string) => {
        if (revokingId) return;
        setRevokingId(providerId);
        try {
            const res = await fetch('/api/account/consents/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId }),
            });
            if (!res.ok) throw new Error();
            setShares(prev => (prev ? prev.filter(s => s.provider_id !== providerId) : prev));
            toast.success('Access removed.');
        } catch {
            toast.error('Could not remove access. Please try again.');
        } finally {
            setRevokingId(null);
        }
    };

    const toggleConsent = async (key: keyof ConsentState) => {
        if (!consent) return;
        const next = { ...consent, [key]: !consent[key] };
        setConsent(next);
        await fetch('/api/account/data-consent', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: next[key] }),
        });
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/account/export');
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mendr-data-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button type="button" variant="ghost" size="icon" aria-label="Go back" onClick={() => router.back()}>
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">Privacy</h1>
                                        <p className="text-sm text-muted-foreground">Log in to manage your privacy settings.</p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/privacy">Log In</Link>
                                    </Button>
                                </div>
                            </div>
                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">

                                {/* Page title */}
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">Privacy</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {/* Data Usage */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-lg font-semibold text-foreground">Data Usage</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                        </p>
                                    </div>

                                    {consent === null ? (
                                        /*
                                         * SKELETON — mirrors the CONSENT_ROWS toggle rows
                                         * rendered when consent prefs load.
                                         * Each row: label (text-sm) + description (text-xs)
                                         * on the left · Switch (h-[1.15rem] w-8) on the right.
                                         * No leading icon. gap-4 between text and switch, py-2
                                         * vertical padding (matches the real rows exactly).
                                         * Row count matches CONSENT_ROWS (currently 2).
                                         * ⚠️ If you add/remove rows in CONSENT_ROWS, or change
                                         * the row layout, update this skeleton to match so there
                                         * is no layout shift when data arrives.
                                         */
                                        <div className="flex flex-col gap-1">
                                            {[0, 1].map((i) => (
                                                <div key={i} className="flex items-center gap-4 py-2">
                                                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                        <Skeleton className="h-3.5 w-2/5 rounded" />
                                                        <Skeleton className="h-3 w-4/5 rounded" />
                                                    </div>
                                                    <Skeleton className="h-[1.15rem] w-8 shrink-0 rounded-full" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            {CONSENT_ROWS.map((row) => (
                                                <div key={row.id} className="flex items-center gap-4 py-2">
                                                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                        <p className="text-sm font-medium">{row.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        checked={consent[row.id]}
                                                        onCheckedChange={() => toggleConsent(row.id)}
                                                        aria-label={row.label}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Sharing With Specialists */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-lg font-semibold text-foreground">Sharing With Specialists</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Control how your details are shared when you contact a specialist.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4 py-2">
                                        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                            <p className="text-sm font-medium">Always Share With Specialists I Contact</p>
                                            <p className="text-xs text-muted-foreground">
                                                When off, we ask you to confirm each time before sharing your details.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={shareMode === 'always_share'}
                                            onCheckedChange={() => void toggleShareMode()}
                                            aria-label="Always share with specialists I contact"
                                            disabled={shareMode === null}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <p className="text-sm font-medium">Specialists You Have Shared Details With</p>
                                        {shares === null ? (
                                            <div className="flex flex-col">
                                                {[0, 1].map((i) => (
                                                    <div key={i} className="flex items-center gap-3 py-3">
                                                        <Skeleton className="size-12 shrink-0 rounded-md" />
                                                        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                                                            <Skeleton className="h-3.5 w-2/5 rounded" />
                                                            <Skeleton className="h-3 w-3/5 rounded" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : shares.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">
                                                You have not shared your details with any specialists yet.
                                            </p>
                                        ) : (
                                            <div className="flex flex-col">
                                                {shares.map((s, i) => (
                                                    <Fragment key={s.provider_id}>
                                                        {i > 0 && <Separator />}
                                                        <div className="flex items-center gap-3 py-3">
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                size="icon"
                                                                className="size-12 shrink-0"
                                                                tabIndex={-1}
                                                                aria-hidden="true"
                                                            />
                                                            <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                                                                <p className="text-sm font-medium">{s.name}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    Can see your name and number.
                                                                </p>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => void revokeShare(s.provider_id)}
                                                                disabled={revokingId === s.provider_id}
                                                            >
                                                                {revokingId === s.provider_id ? (
                                                                    <Spinner className="size-4" />
                                                                ) : (
                                                                    'Revoke'
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </Fragment>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        Revoking stops us sharing your details going forward and asks the specialist to delete them. It cannot recall a message you have already sent.
                                    </p>
                                </div>

                                {/* Data Export */}
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-lg font-semibold text-foreground">Data Export</h2>
                                        <p className="text-sm text-muted-foreground">
                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                        </p>
                                    </div>

                                    <div className="flex flex-col">
                                        {EXPORT_ITEMS.map((label, index) => (
                                            <div key={label}>
                                                {index > 0 && <Separator />}
                                                <div className="flex items-center gap-3 py-3">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="icon"
                                                        className="size-12 shrink-0"
                                                        tabIndex={-1}
                                                        aria-hidden="true"
                                                    />
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <p className="text-sm font-medium">{label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                                        {exporting ? 'Preparing Export…' : 'Download Export'}
                                    </Button>
                                </div>

                            </div>
                        </div>
                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
