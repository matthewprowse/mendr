'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthHeader } from '../_components/auth-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LogInContent() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
        null
    );
    const searchParams = useSearchParams();

    useEffect(() => {
        const err = searchParams.get('error');
        if (err === 'auth_callback_error') {
            setMessage({ type: 'error', text: 'Invalid or expired link. Please try again.' });
        } else if (err === 'missing_params') {
            setMessage({ type: 'error', text: 'Invalid authentication link.' });
        }
    }, [searchParams]);

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const next = searchParams.get('next') ?? '/';
        const redirectTo =
            typeof window !== 'undefined'
                ? `${window.location.origin}/auth/callback${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`
                : undefined;

        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: redirectTo },
        });

        setLoading(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
            return;
        }

        setMessage({
            type: 'success',
            text: 'Check your email for the log-in link.',
        });
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AuthHeader />
            <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
                <div className="w-full max-w-sm space-y-6">
                    <div className="space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
                        <p className="text-sm text-muted-foreground">
                            We&apos;ll send you an email with a log-in link.
                        </p>
                    </div>

                    <form onSubmit={handleMagicLink} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                disabled={loading}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Sending…' : 'Continue with Email'}
                        </Button>
                    </form>

                    {message && (
                        <p
                            className={`text-sm text-center ${
                                message.type === 'success'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-destructive'
                            }`}
                        >
                            {message.text}
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function LogInPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen flex-col bg-background">
                    <AuthHeader />
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-sm text-muted-foreground">Loading…</p>
                    </div>
                </div>
            }
        >
            <LogInContent />
        </Suspense>
    );
}
