'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabase } from '@/lib/auth/supabase';

interface HomeownerAuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Why sign-in is needed, shown as the dialog subtitle. */
    reason?: string;
    /** Page to return to after auth completes. Defaults to current page. */
    returnTo?: string;
}

type Step = 'options' | 'email' | 'sent';

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

export function HomeownerAuthDialog({
    open,
    onOpenChange,
    reason,
    returnTo,
}: HomeownerAuthDialogProps) {
    const [step, setStep] = useState<Step>('options');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = (v: boolean) => {
        if (!v) {
            setStep('options');
            setEmail('');
            setError(null);
        }
        onOpenChange(v);
    };

    const buildReturnUrl = () => {
        if (typeof window === 'undefined') return '/';
        const next = returnTo ?? window.location.pathname + window.location.search;
        return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        const supabase = getSupabase();
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: buildReturnUrl() },
        });
        if (oauthError) {
            setError(oauthError.message);
            setLoading(false);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const supabase = getSupabase();
        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: buildReturnUrl() },
        });
        setLoading(false);
        if (otpError) {
            setError(otpError.message);
            return;
        }
        setStep('sent');
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-sm">
                {step === 'options' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Sign in or create account</DialogTitle>
                            <DialogDescription>
                                {reason ?? "It's free — use your Google account or email address."}
                            </DialogDescription>
                        </DialogHeader>
                        {error && (
                            <p className="text-sm text-destructive" role="alert">
                                {error}
                            </p>
                        )}
                        <div className="flex flex-col gap-3 pt-1">
                            <Button
                                className="flex w-full items-center justify-center gap-2"
                                onClick={() => void handleGoogleSignIn()}
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
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setStep('email')}
                                disabled={loading}
                            >
                                Continue with Email
                            </Button>
                        </div>
                    </>
                )}

                {step === 'email' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Sign in with email</DialogTitle>
                            <DialogDescription>
                                We&apos;ll send a sign-in link — no password needed.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={(e) => void handleEmailSubmit(e)} className="flex flex-col gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="hw-auth-email">Email address</Label>
                                <Input
                                    id="hw-auth-email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    disabled={loading}
                                />
                            </div>
                            {error && (
                                <p className="text-sm text-destructive" role="alert">
                                    {error}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => setStep('options')}
                                    disabled={loading}
                                >
                                    Back
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={loading || !email.trim()}
                                >
                                    {loading ? 'Sending…' : 'Send link'}
                                </Button>
                            </div>
                        </form>
                    </>
                )}

                {step === 'sent' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Check your email</DialogTitle>
                            <DialogDescription>
                                We&apos;ve sent a sign-in link to{' '}
                                <span className="font-medium text-foreground">{email}</span>. Click
                                the link and you&apos;ll be brought back here automatically.
                            </DialogDescription>
                        </DialogHeader>
                        <Button variant="outline" className="w-full" onClick={() => handleClose(false)}>
                            Close
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
