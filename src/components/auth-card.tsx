'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/auth/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AuthCardProps = {
    mode: 'signin' | 'signup';
    redirectTo?: string;
    heading?: string;
    subheading?: string;
};

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none">
            <path
                d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                fill="#4285F4"
            />
            <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                fill="#34A853"
            />
            <path
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                fill="#FBBC05"
            />
            <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
                fill="#EA4335"
            />
        </svg>
    );
}

export function AuthCard({ mode, redirectTo, heading, subheading }: AuthCardProps) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [magicLink, setMagicLink] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const supabase = getSupabase();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const next = redirectTo ?? '/';
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

    async function handleGoogleSignIn() {
        setLoading(true);
        setError(null);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: callbackUrl },
        });
        if (oauthError) {
            setError(oauthError.message);
            setLoading(false);
        }
        // On success the browser redirects — no further action needed.
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError('Please enter your email address.');
            return;
        }

        setLoading(true);
        try {
            if (magicLink) {
                const { error: otpError } = await supabase.auth.signInWithOtp({
                    email: trimmedEmail,
                    options: { emailRedirectTo: callbackUrl },
                });
                if (otpError) {
                    setError(otpError.message);
                } else {
                    setSuccessMsg('Check your email — we sent you a sign-in link.');
                }
                return;
            }

            if (!password) {
                setError('Please enter your password.');
                return;
            }

            if (mode === 'signup') {
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email: trimmedEmail,
                    password,
                    options: { emailRedirectTo: callbackUrl },
                });
                if (signUpError) {
                    setError(signUpError.message);
                } else if (data.session) {
                    router.push(next);
                } else {
                    setSuccessMsg('Check your email to confirm your account.');
                }
            } else {
                const { data, error: signInError } = await supabase.auth.signInWithPassword({
                    email: trimmedEmail,
                    password,
                });
                if (signInError) {
                    setError(signInError.message);
                } else if (data.session) {
                    router.push(next);
                }
            }
        } finally {
            setLoading(false);
        }
    }

    const submitLabel = magicLink
        ? loading
            ? 'Sending…'
            : 'Send sign-in link'
        : mode === 'signup'
          ? loading
              ? 'Creating account…'
              : 'Create account'
          : loading
            ? 'Signing in…'
            : 'Sign in';

    return (
        <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-sm">
            {heading && (
                <h1 className="mb-1 text-xl font-semibold tracking-tight text-gray-900">{heading}</h1>
            )}
            {subheading && (
                <p className="mb-6 text-sm text-muted-foreground">{subheading}</p>
            )}
            {!heading && !subheading && <div className="mb-6" />}

            {/* Google OAuth */}
            <Button
                type="button"
                variant="outline"
                className="mb-4 flex w-full items-center justify-center gap-2"
                onClick={() => void handleGoogleSignIn()}
                disabled={loading}
            >
                <GoogleIcon />
                Continue with Google
            </Button>

            {/* Divider */}
            <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
            </div>

            {/* Email / password form */}
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-email">Email</Label>
                    <Input
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                    />
                </div>

                {!magicLink && (
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="auth-password">Password</Label>
                        <Input
                            id="auth-password"
                            type="password"
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                )}

                {/* Error / success messages */}
                {error && (
                    <p className="text-sm text-red-600" role="alert">
                        {error}
                    </p>
                )}
                {successMsg && (
                    <p className="text-sm text-green-700" role="status">
                        {successMsg}
                    </p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                    {submitLabel}
                </Button>
            </form>

            {/* Magic-link toggle */}
            <button
                type="button"
                className={cn(
                    'mt-4 w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline',
                )}
                onClick={() => {
                    setMagicLink((v) => !v);
                    setError(null);
                    setSuccessMsg(null);
                }}
            >
                {magicLink ? 'Sign in with password instead' : 'Sign in without a password'}
            </button>
        </div>
    );
}
