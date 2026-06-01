'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { BRAND_NAME } from '@/lib/brand-system';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';

export default function LoginClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [mode, setMode] = useState<'password' | 'magic'>('password');
    const [loading, setLoading] = useState(false);
    const [magicSent, setMagicSent] = useState(false);

    const callbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `/auth/callback?next=${encodeURIComponent(next)}`;

    const canSubmit =
        mode === 'magic'
            ? email.trim().length > 0
            : email.trim().length > 0 && password.length >= 6;

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
        />
    );

    if (magicSent) {
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
                                            We sent a sign-in link to{' '}
                                            <span className="font-medium text-foreground">{email}</span>.
                                            Click it to log in.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="self-center text-muted-foreground"
                                        onClick={() => {
                                            setMagicSent(false);
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
                                        Welcome Back
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="w-full"
                                            onClick={() => void handleOAuth('google')}
                                            disabled={loading}
                                        >
                                            Continue with Google
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="w-full"
                                            onClick={() => void handleOAuth('apple')}
                                            disabled={loading}
                                        >
                                            Continue with Apple
                                        </Button>
                                    </div>

                                    <Separator />

                                    <div className="flex flex-col gap-3">
                                        <Label htmlFor="email">Email</Label>
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

                                    {mode === 'password' && (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="password">Password</Label>
                                                <Button
                                                    asChild
                                                    variant="link"
                                                    className="h-auto p-0 text-xs text-muted-foreground"
                                                >
                                                    <Link href="/auth/forgot">
                                                        Forgot Password?
                                                    </Link>
                                                </Button>
                                            </div>
                                            <div className="relative">
                                                <Input
                                                    id="password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    className="pr-11"
                                                    value={password}
                                                    onChange={(e) =>
                                                        setPassword(e.target.value)
                                                    }
                                                    required
                                                    autoComplete="current-password"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    className="absolute right-1 top-1/2 -translate-y-1/2"
                                                    onClick={() =>
                                                        setShowPassword((s) => !s)
                                                    }
                                                    aria-label={
                                                        showPassword
                                                            ? 'Hide password'
                                                            : 'Show password'
                                                    }
                                                >
                                                    {showPassword ? <EyeOff /> : <Eye />}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full"
                                        onClick={() =>
                                            setMode((m) =>
                                                m === 'password' ? 'magic' : 'password'
                                            )
                                        }
                                    >
                                        {mode === 'password'
                                            ? 'Use a Magic Link Instead'
                                            : 'Use a Password Instead'}
                                    </Button>
                                </div>

                                <p className="text-center text-sm text-muted-foreground">
                                    Don&apos;t Have an Account?{' '}
                                    <Link
                                        href={`/auth/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                                        className="font-medium text-foreground hover:underline"
                                    >
                                        Create One
                                    </Link>
                                </p>
                            </div>
                        </div>

                        <div className="sticky bottom-0 shrink-0 bg-background p-4">
                            <div className="w-full max-w-xl mx-auto flex flex-col gap-2">
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={!canSubmit || loading}
                                >
                                    {loading
                                        ? 'Logging In…'
                                        : mode === 'magic'
                                          ? 'Send Magic Link'
                                          : 'Log In'}
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
