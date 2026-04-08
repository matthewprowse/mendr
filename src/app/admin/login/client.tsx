'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/admin';

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
                body: JSON.stringify({ password, next }),
            });
            if (!res.ok) {
                setError('Incorrect password.');
                return;
            }
            router.push(next);
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
                    <span className="text-xl font-bold tracking-tight text-foreground">Scandio</span>
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
