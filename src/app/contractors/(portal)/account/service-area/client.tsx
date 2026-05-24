'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    const [saveOk, setSaveOk] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/contractors/account/service-area', { cache: 'no-store' });
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

    const onMapChange = useCallback(
        (next: { lat: number; lng: number; radiusKm: number }) => {
            setDraft(next);
            setSaveOk(false);
        },
        [],
    );

    async function handleSave() {
        if (!draft) return;
        setIsSaving(true);
        setSaveError(null);
        setSaveOk(false);
        try {
            const res = await fetch('/api/contractors/account/service-area', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (!res.ok || !json?.ok) {
                setSaveError(json?.error ?? 'Could not save your service area.');
                return;
            }
            setSaveOk(true);
        } catch {
            setSaveError('Network error. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }

    if (state.kind === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
                <p className="text-sm text-muted-foreground">Loading your service area…</p>
            </div>
        );
    }

    if (state.kind === 'error') {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Service area</CardTitle>
                        <CardDescription>{state.message}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={() => router.push('/contractors/account')}>
                            Back to account
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-8">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                    <CardTitle>Service area</CardTitle>
                    <CardDescription>
                        Drop the pin where you're based and drag the circle to cover the area you'll
                        travel to. Leads outside this area will no longer be sent to you.
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
                        <p className="text-sm text-red-600" role="alert">
                            {saveError}
                        </p>
                    )}
                    {saveOk && (
                        <p className="text-sm text-green-700" role="status">
                            Service area saved.
                        </p>
                    )}
                    <div className="flex gap-2">
                        <Button
                            onClick={() => void handleSave()}
                            disabled={!draft || isSaving}
                            className="flex-1"
                        >
                            {isSaving ? 'Saving…' : 'Save service area'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => router.push('/contractors/account')}
                            disabled={isSaving}
                        >
                            Back
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
