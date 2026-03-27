'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowStepHeader } from '@/components/flow-header';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import Link from 'next/link';

function GoogleIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'password' | 'magic'>('password');
    const [loading, setLoading] = useState(false);
    const [magicSent, setMagicSent] = useState(false);

    const callbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `/auth/callback?next=${encodeURIComponent(next)}`;

    const canSubmit =
        mode === 'magic' ? email.trim().length > 0 : email.trim().length > 0 && password.length >= 6;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'magic') {
                const { error } = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: { emailRedirectTo: callbackUrl },
                });
                if (error) throw error;
                setMagicSent(true);
            } else {
                const { error } = await (supabase.auth as any).signInWithPassword({
                    email: email.trim(),
                    password,
                });
                if (error) throw error;
                router.push(next);
            }
        } catch (err: unknown) {
            toast.error((err as { message?: string })?.message || 'Sign in failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogle() {
        setLoading(true);
        try {
            await (supabase.auth as any).signInWithOAuth({
                provider: 'google',
                options: { redirectTo: callbackUrl },
            });
        } catch (err: unknown) {
            toast.error((err as { message?: string })?.message || 'Google sign-in failed.');
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={1} onBack={() => router.back()} />

            <div className="flex flex-1 justify-center px-4 pt-24 pb-32 sm:px-6">
                <div className="w-full max-w-sm">
                    {magicSent ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
                                <p className="text-sm text-muted-foreground">
                                    We sent a sign-in link to{' '}
                                    <span className="font-medium text-foreground">{email}</span>. Click
                                    it to sign in.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="self-start text-sm text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => { setMagicSent(false); setEmail(''); }}
                            >
                                ← Use a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">Welcome back.</h1>
                                <p className="text-sm text-muted-foreground">
                                    {mode === 'magic'
                                        ? "We'll email you a sign-in link — no password needed."
                                        : 'Sign in to your Scandio account.'}
                                </p>
                            </div>

                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full gap-2 text-sm"
                                onClick={handleGoogle}
                                disabled={loading}
                            >
                                <GoogleIcon />
                                Continue with Google
                            </Button>

                            <div className="flex items-center gap-3">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground">or</span>
                                <div className="h-px flex-1 bg-border" />
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        className="h-10 w-full text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="email"
                                        autoFocus
                                    />
                                </div>

                                {mode === 'password' && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="password">Password</Label>
                                            <Link
                                                href="/auth/forgot"
                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                Forgot password?
                                            </Link>
                                        </div>
                                        <Input
                                            id="password"
                                            type="password"
                                            className="h-10 w-full text-sm"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            autoComplete="current-password"
                                        />
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => setMode((m) => (m === 'password' ? 'magic' : 'password'))}
                            >
                                {mode === 'password'
                                    ? 'Sign in with a magic link instead →'
                                    : 'Sign in with password instead →'}
                            </button>

                            <p className="text-sm text-muted-foreground">
                                Don&apos;t have an account?{' '}
                                <Link
                                    href={`/auth/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                                    className="text-foreground font-medium hover:underline"
                                >
                                    Create one
                                </Link>
                            </p>
                        </form>
                    )}
                </div>
            </div>

            {/* Fixed bottom action bar */}
            {!magicSent && (
                <div className="fixed inset-x-0 bottom-0 z-50 bg-background p-4">
                    <div className="mx-auto w-full max-w-sm">
                        <Button
                            type="submit"
                            form="login-form"
                            className="h-10 w-full"
                            disabled={!canSubmit || loading}
                            onClick={handleSubmit}
                        >
                            {loading
                                ? 'Signing in…'
                                : mode === 'magic'
                                  ? 'Send Magic Link'
                                  : 'Sign In'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
