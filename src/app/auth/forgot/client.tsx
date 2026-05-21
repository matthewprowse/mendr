'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowStepHeader } from '@/components/flow-header';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const resetCallbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=/auth/reset`
            : '/auth/callback?next=/auth/reset';

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        try {
            const { error } = await (supabase.auth as any).resetPasswordForEmail(email.trim(), {
                redirectTo: resetCallbackUrl,
            });
            if (error) throw error;
            setSent(true);
        } catch (err: unknown) {
            toast.error(
                (err as { message?: string })?.message || 'Could not send reset email. Try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={1} onBack={() => router.back()} />

            <div className="flex flex-1 justify-center px-4 pt-24 pb-32 sm:px-6">
                <div className="w-full max-w-sm">
                    {sent ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
                                <p className="text-sm text-muted-foreground">
                                    We sent a password reset link to{' '}
                                    <span className="font-medium text-foreground">{email}</span>. Click
                                    it to choose a new password.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="self-start text-sm text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => { setSent(false); setEmail(''); }}
                            >
                                ← Resend to a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">
                                    Reset your password.
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Enter your email and we&apos;ll send you a reset link.
                                </p>
                            </div>

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

                            <Link
                                href="/auth"
                                className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                ← Back to sign in
                            </Link>
                        </form>
                    )}
                </div>
            </div>

            {/* Fixed bottom action bar */}
            {!sent && (
                <div className="fixed inset-x-0 bottom-0 z-50 bg-background p-4">
                    <div className="mx-auto w-full max-w-sm">
                        <Button
                            type="button"
                            className="h-10 w-full"
                            disabled={!email.trim() || loading}
                            onClick={handleSubmit}
                        >
                            {loading ? 'Sending…' : 'Send Reset Link'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
