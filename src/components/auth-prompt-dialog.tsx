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
import { supabase } from '@/lib/supabase';

interface AuthPromptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Shown inside the dialog to explain why log-in is needed. */
    reason?: string;
    /** Current page path — after log-in the user is returned here. */
    returnTo?: string;
}

type Step = 'prompt' | 'email' | 'sent';

/**
 * Reusable dialog that prompts unauthenticated users to sign in via a
 * magic-link email before performing a protected action (favourite, review, etc.).
 *
 * After the magic-link is clicked the auth callback redirects back to `returnTo`.
 */
export function AuthPromptDialog({
    open,
    onOpenChange,
    reason = 'You need to be logged in to do that.',
    returnTo,
}: AuthPromptDialogProps) {
    const [step, setStep] = useState<Step>('prompt');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = (v: boolean) => {
        if (!v) {
            setStep('prompt');
            setEmail('');
            setError(null);
        }
        onOpenChange(v);
    };

    const handleSendLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const next = returnTo ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/');
        const redirectTo =
            typeof window !== 'undefined'
                ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
                : undefined;

        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: redirectTo },
        });

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        setStep('sent');
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-sm">
                {step === 'prompt' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Login or Register to Continue</DialogTitle>
                            <DialogDescription>{reason}</DialogDescription>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">
                            Logging in is free and takes seconds — we&apos;ll send you a link by
                            email.
                        </p>
                        <div className="flex flex-col gap-2 pt-1">
                            <Button className="w-full" onClick={() => setStep('email')}>
                                Continue with Email Address
                            </Button>
                            <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
                                Maybe Later
                            </Button>
                        </div>
                    </>
                )}

                {step === 'email' && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Log in</DialogTitle>
                            <DialogDescription>
                                We&apos;ll email you a log-in link — no password needed.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSendLink} className="flex flex-col gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="auth-email">Email address</Label>
                                <Input
                                    id="auth-email"
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
                                <p className="text-sm text-destructive">{error}</p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => setStep('prompt')}
                                    disabled={loading}
                                >
                                    Back
                                </Button>
                                <Button type="submit" className="flex-1" disabled={loading || !email.trim()}>
                                    {loading ? 'Sending…' : 'Send Link'}
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
                                We&apos;ve sent a log-in link to{' '}
                                <span className="font-medium text-foreground">{email}</span>. Click
                                the link to log in and you&apos;ll be brought back here
                                automatically.
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
