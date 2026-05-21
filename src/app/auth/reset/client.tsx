'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowStepHeader } from '@/components/flow-header';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
    const router = useRouter();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const passwordsMatch = password === confirm;
    const canSubmit = password.length >= 8 && confirm.length >= 8 && passwordsMatch;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        try {
            const { error } = await (supabase.auth as any).updateUser({ password });
            if (error) throw error;
            setDone(true);
        } catch (err: unknown) {
            toast.error(
                (err as { message?: string })?.message || 'Could not update password. Try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <FlowStepHeader step={1} onBack={null} />

            <div className="flex flex-1 justify-center px-4 pt-24 pb-32 sm:px-6">
                <div className="w-full max-w-sm">
                    {done ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">
                                    Password updated.
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Your password has been changed. You&apos;re now signed in.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="self-start text-sm text-foreground font-medium hover:underline"
                                onClick={() => router.push('/')}
                            >
                                Go to Menda →
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <h1 className="text-2xl font-bold text-foreground">
                                    Choose a new password.
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    At least 8 characters.
                                </p>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="password">New password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        className="h-10 w-full text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="At least 8 characters"
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex flex-col gap-3">
                                    <Label htmlFor="confirm">Confirm password</Label>
                                    <Input
                                        id="confirm"
                                        type="password"
                                        className="h-10 w-full text-sm"
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        placeholder="Repeat your password"
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
                                    />
                                    {confirm.length > 0 && !passwordsMatch && (
                                        <p className="text-xs text-destructive">
                                            Passwords don&apos;t match.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            </div>

            {/* Fixed bottom action bar */}
            {!done && (
                <div className="fixed inset-x-0 bottom-0 z-50 bg-background p-4">
                    <div className="mx-auto w-full max-w-sm">
                        <Button
                            type="button"
                            className="h-10 w-full"
                            disabled={!canSubmit || loading}
                            onClick={handleSubmit}
                        >
                            {loading ? 'Updating…' : 'Update Password'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
