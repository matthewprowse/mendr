'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ServiceAreaMap from './components/service-area-map';

type LoadState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | {
          kind: 'ready';
          providerId: string;
          name: string | null;
          initialLat: number | null;
          initialLng: number | null;
          initialRadiusKm: number;
          suggestedLat: number | null;
          suggestedLng: number | null;
      };

type ServiceAreaResponse = {
    providerId: string;
    name: string | null;
    suggestedLat: number | null;
    suggestedLng: number | null;
    serviceArea: { lat: number | null; lng: number | null; radiusKm: number };
};

export default function ServiceAreaClient() {
    const router = useRouter();
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [draft, setDraft] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/pro/account/service-area', { cache: 'no-store' });
                const json = (await res.json().catch(() => null)) as
                    | (ServiceAreaResponse & { error?: string })
                    | null;
                if (cancelled) return;
                if (!res.ok || !json || json.error) {
                    setState({
                        kind: 'error',
                        message: json?.error ?? 'Could not load your service area.',
                    });
                    return;
                }
                setState({
                    kind: 'ready',
                    providerId: json.providerId,
                    name: json.name,
                    initialLat: json.serviceArea.lat,
                    initialLng: json.serviceArea.lng,
                    initialRadiusKm: json.serviceArea.radiusKm,
                    suggestedLat: json.suggestedLat,
                    suggestedLng: json.suggestedLng,
                });
            } catch {
                if (!cancelled) {
                    setState({ kind: 'error', message: 'Network error. Please try again.' });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onMapChange = useCallback((next: { lat: number; lng: number; radiusKm: number }) => {
        setDraft(next);
    }, []);

    async function handleSave() {
        if (!draft) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const res = await fetch('/api/pro/account/service-area', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (!res.ok || !json?.ok) {
                setSaveError(json?.error ?? 'Could not save your service area.');
                return;
            }
            toast.success('Service area saved.');
        } catch {
            setSaveError('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    if (state.kind === 'loading') {
        return (
            <p className="py-12 text-center text-sm text-muted-foreground">
                Loading your service area…
            </p>
        );
    }

    if (state.kind === 'error') {
        return (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
                <p className="text-sm text-destructive">{state.message}</p>
                <Button variant="secondary" onClick={() => router.push('/pro/account')}>
                    Back to Account
                </Button>
            </div>
        );
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Service Area</CardTitle>
                <CardDescription>
                    Drop the pin where you&apos;re based and drag the circle to cover the area
                    you&apos;ll travel to. Leads outside this area will no longer be sent to you.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <ServiceAreaMap
                    initialLat={state.initialLat ?? state.suggestedLat}
                    initialLng={state.initialLng ?? state.suggestedLng}
                    initialRadiusKm={state.initialRadiusKm}
                    onChange={onMapChange}
                />
                {saveError && (
                    <p className="text-sm text-destructive" role="alert">
                        {saveError}
                    </p>
                )}
                <Button
                    onClick={() => void handleSave()}
                    disabled={!draft || isSaving}
                    className="w-full"
                >
                    {isSaving ? 'Saving…' : 'Save Service Area'}
                </Button>
            </CardContent>
        </Card>
    );
}
