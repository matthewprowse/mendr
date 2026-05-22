'use client';

import { useCallback, useEffect, useState } from 'react';

export function useSavedProvider(providerId: string | null, isAuthenticated: boolean) {
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!providerId || !isAuthenticated) {
            setSaved(false);
            return;
        }
        let cancelled = false;
        fetch(`/api/account/saved-providers?providerId=${encodeURIComponent(providerId)}`)
            .then((r) => r.json())
            .then((data: { saved?: boolean }) => {
                if (!cancelled) setSaved(Boolean(data.saved));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [providerId, isAuthenticated]);

    const toggle = useCallback(async (): Promise<boolean | null> => {
        if (!providerId) return null;
        setLoading(true);
        try {
            const res = await fetch('/api/account/saved-providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ providerId }),
            });
            if (!res.ok) return null;
            const data = (await res.json()) as { saved: boolean };
            setSaved(data.saved);
            return data.saved;
        } catch {
            return null;
        } finally {
            setLoading(false);
        }
    }, [providerId]);

    return { saved, loading, toggle };
}
