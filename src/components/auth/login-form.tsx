'use client';

// Shared login form used by /auth/login (homeowner) and /pro/auth/login
// (contractor). Brand and routing differences come in as props.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';

export function AuthLoginForm({
    brandName,
    defaultNext,
    registerPath,
    forgotPath,
}: {
    brandName: string;
    defaultNext: string;
    registerPath: string;
    forgotPath: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || defaultNext;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const callbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `/auth/callback?next=${encodeURIComponent(next)}`;

    const canSubmit = email.trim().length > 0 && password.length >= 6;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await (supabase.auth as any).signInWithPassword({
                email: email.trim(),
                password,
            });
            if (error) throw error;
            router.push(next);
        } catch (err: unknown) {
            toast.error(
                (err as { message?: string })?.message || 'Login failed. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleOAuth(provider: 'google' | 'apple') {
        setLoading(true);
        try {
            await (supabase.auth as any).signInWithOAuth({
                provider,
                options: { redirectTo: callbackUrl },
            });
        } catch (err: unknown) {
            toast.error(
                (err as { message?: string })?.message ||
                    `${provider === 'apple' ? 'Apple' : 'Google'} sign-in failed.`
            );
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
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
                        {brandName}
                    </p>
                }
                rightSlot={
                    <Button asChild variant="ghost" size="sm">
                        <Link href={`${registerPath}${next !== defaultNext ? `?next=${encodeURIComponent(next)}` : ''}`}>
                            Register
                        </Link>
                    </Button>
                }
            />
            <div className="flex-1 overflow-hidden">
                <form onSubmit={handleSubmit} className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
                            <div className="flex flex-col gap-8 w-full max-w-xl">
                                <div className="flex w-full flex-col items-center gap-3 text-center">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Welcome Back
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-8">
                                    <div className="flex flex-row gap-3">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="flex-1"
                                            onClick={() => void handleOAuth('google')}
                                            disabled={loading}
                                        >
                                            Google
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="flex-1"
                                            onClick={() => void handleOAuth('apple')}
                                            disabled={loading}
                                        >
                                            Apple
                                        </Button>
                                    </div>

                                    <Separator />

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

                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="password">Password</Label>
                                            <Link
                                                href={forgotPath}
                                                className="text-sm text-muted-foreground hover:text-foreground"
                                            >
                                                Forgot Password?
                                            </Link>
                                        </div>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                autoComplete="current-password"
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((s) => !s)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        <div className="sticky bottom-0 shrink-0 bg-background p-4">
                            <div className="w-full max-w-xl mx-auto flex flex-col gap-2">
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={!canSubmit || loading}
                                >
                                    {loading ? 'Logging In…' : 'Login'}
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
