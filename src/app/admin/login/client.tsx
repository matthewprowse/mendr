'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeRedirectPath } from '@/lib/safe-redirect';

const ADMIN_FALLBACK = '/admin';
const ADMIN_REDIRECT_OPTIONS = { allowedPathPrefixes: ['/admin'] } as const;

export default function AdminLoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawNext = searchParams.get('next');
    // Compute the safe redirect once per `next` change so the form submit
    // and any server-side intent stay in sync.
    const safeNext = useMemo(
        () => safeRedirectPath(rawNext, ADMIN_FALLBACK, ADMIN_REDIRECT_OPTIONS),
        [rawNext],
    );

    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, next: safeNext }),
            });
            if (!res.ok) {
                setError('Incorrect password.');
                return;
            }
            router.push(safeNext);
            router.refresh();
        } catch {
            setError('Something went wrong. Try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="flex flex-col items-center gap-2 text-center">
                    <span className="text-xl font-bold tracking-tight text-foreground">Menda</span>
                    <p className="text-sm text-muted-foreground">Admin access</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                            required
                            className="h-10"
                        />
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button type="submit" className="h-10 w-full" disabled={loading || !password}>
                        {loading ? 'Signing in…' : 'Sign In'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
