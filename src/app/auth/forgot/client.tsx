'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowTopBar } from '@/components/match/flow-shell';
import { BRAND_NAME } from '@/lib/brand-system';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/';

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const resetCallbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=/auth/reset`
            : '/auth/callback?next=/auth/reset';

    const canSubmit = email.trim().length > 0;

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

    const header = (
        <FlowTopBar
            className="p-4"
            leftSlot={
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Go back"
                    onClick={() => router.back()}
                >
                    <ArrowLeft strokeWidth={2.5} />
                </Button>
            }
            centerSlot={
                <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                    {BRAND_NAME}
                </p>
            }
            rightSlot={
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/auth/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
                        Login
                    </Link>
                </Button>
            }
        />
    );

    if (sent) {
        return (
            <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
                {header}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-y-auto">
                        <div className="flex min-h-full flex-col">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                                <div className="flex flex-col gap-8 w-full max-w-xl">
                                    <div className="flex w-full flex-col items-center gap-3 text-center">
                                        <h1 className="text-2xl font-semibold text-foreground">
                                            Check Your Inbox
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            We sent a password reset link to{' '}
                                            <span className="font-medium text-foreground">{email}</span>.
                                            Click it to choose a new password.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="self-center text-muted-foreground"
                                        onClick={() => {
                                            setSent(false);
                                            setEmail('');
                                        }}
                                    >
                                        ← Use a Different Email
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <form onSubmit={handleSubmit} className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                            <div className="flex flex-col gap-8 w-full max-w-xl">
                                <div className="flex w-full flex-col items-center gap-3 text-center">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Reset Password
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-8">
                                    <div className="flex flex-col gap-3">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            autoComplete="email"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="sticky bottom-0 shrink-0 bg-background p-4">
                            <div className="w-full max-w-xl mx-auto flex flex-col gap-2">
                                <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
                                    {loading ? 'Sending…' : 'Send Reset Link'}
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                </p>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
