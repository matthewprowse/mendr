'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthHeader } from '../_components/auth-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function LogInContent() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [oauthLoading, setOauthLoading] = useState(false);
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

        if (!email.trim()) {
            setLoading(false);
            setMessage({ type: 'error', text: 'Please enter your Email Address.' });
            return;
        }

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
            text: 'Magic Link sent. Check your email to finish logging in.',
        });
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setLoading(false);
            setMessage({ type: 'error', text: 'Please enter your Email Address.' });
            return;
        }
        if (!password) {
            setLoading(false);
            setMessage({ type: 'error', text: 'Please enter your Password, or use a Magic Link' });
            return;
        }

        const { error } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
        });

        setLoading(false);

        if (error) {
            setMessage({ type: 'error', text: error.message });
            return;
        }
    };

    const handleGoogle = async () => {
        setOauthLoading(true);
        setMessage(null);

        const next = searchParams.get('next') ?? '/';
        const redirectTo =
            typeof window !== 'undefined'
                ? `${window.location.origin}/auth/callback${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`
                : undefined;

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
            },
        });

        // Redirect happens on success; only handle errors here.
        if (error) {
            setMessage({ type: 'error', text: error.message });
            setOauthLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AuthHeader />
            <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
                <Card className="w-full max-w-sm">
                    <CardHeader className="space-y-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
                        <p className="text-sm text-muted-foreground">
                            Welcome back to Scandio. Enter your email address and we&apos;ll send you a secure
                            Magic Link to continue. No passwords required.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={handleGoogle}
                            disabled={oauthLoading || loading}
                        >
                            {oauthLoading ? 'Opening Google…' : 'Continue with Google'}
                        </Button>

                        <div className="flex items-center gap-3">
                            <Separator className="flex-1" />
                            <span className="text-xs text-muted-foreground">OR CONTINUE WITH</span>
                            <Separator className="flex-1" />
                        </div>

                        <form onSubmit={handlePasswordLogin} className="space-y-4">
                            <div>
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="Enter Email Address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    disabled={loading}
                                    className="mt-3 h-9 text-sm"
                                />
                            </div>

                            <div>
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Enter Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    disabled={loading}
                                    className="mt-3 h-9 text-sm"
                                />
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? 'Logging In…' : 'Login'}
                            </Button>

                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full"
                                disabled={loading}
                                onClick={(e) => handleMagicLink(e as unknown as React.FormEvent)}
                            >
                                {loading ? 'Sending…' : 'Send Magic Link'}
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
                    </CardContent>
                </Card>
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
