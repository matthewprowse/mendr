'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

function absoluteUrl(to: string): string {
    if (typeof window === 'undefined') return to;
    const origin = window.location.origin;
    try {
        return new URL(to, origin).toString();
    } catch {
        return origin;
    }
}

function canShareUrl(): boolean {
    if (typeof navigator === 'undefined') return false;
    return typeof navigator.share === 'function';
}

export default function OpenOnPhonePageClient() {
    const searchParams = useSearchParams();
    const to = searchParams.get('to') || '/start';
    const [url, setUrl] = useState<string>(to);
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [copyLabel, setCopyLabel] = useState<'Copy link' | 'Copied'>('Copy link');

    useEffect(() => {
        setUrl(absoluteUrl(to));
    }, [to]);

    useEffect(() => {
        let cancelled = false;
        async function run() {
            try {
                const mod = await import('qrcode');
                const dataUrl = await mod.toDataURL(url, {
                    margin: 1,
                    width: 360,
                    color: { dark: '#0a0a0a', light: '#ffffff' },
                });
                if (!cancelled) setQrDataUrl(dataUrl);
            } catch {
                if (!cancelled) setQrDataUrl('');
            }
        }
        void run();
        return () => {
            cancelled = true;
        };
    }, [url]);

    return (
        <div className="min-h-dvh bg-background px-4 py-10">
            <div className="mx-auto w-full max-w-md space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Open Mendr on your phone</h1>
                    <p className="text-sm text-muted-foreground">
                        Scan this QR code with your phone camera to continue the flow.
                    </p>
                </div>

                <div className="rounded-xl border border-input bg-card p-4">
                    <div className="flex items-center justify-center">
                        {qrDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={qrDataUrl}
                                alt="QR code to open Mendr on your phone"
                                className="h-56 w-56 rounded-lg bg-white p-2"
                            />
                        ) : (
                            <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-input text-sm text-muted-foreground">
                                QR unavailable
                            </div>
                        )}
                    </div>

                    <div className="mt-4 space-y-3">
                        <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{url}</p>
                        <div className="flex gap-2">
                            <Button
                                className="h-10 flex-1"
                                variant="secondary"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(url);
                                        setCopyLabel('Copied');
                                        window.setTimeout(() => setCopyLabel('Copy link'), 1200);
                                    } catch {
                                        // ignore
                                    }
                                }}
                            >
                                {copyLabel}
                            </Button>
                            <Button
                                className="h-10 flex-1"
                                variant="default"
                                disabled={!canShareUrl()}
                                onClick={async () => {
                                    try {
                                        await navigator.share({ url, title: 'Mendr' });
                                    } catch {
                                        // ignore
                                    }
                                }}
                            >
                                Share
                            </Button>
                        </div>
                    </div>
                </div>

                <p className="text-xs text-muted-foreground">
                    Tip: On iPhone, tap “Share” to AirDrop this link to your phone.
                </p>
            </div>
        </div>
    );
}

