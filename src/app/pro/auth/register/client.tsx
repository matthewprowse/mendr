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
import { BRAND_NAME_PRO } from '@/lib/brand-system';
import { supabase } from '@/lib/auth/supabase';
import { toast } from 'sonner';

export default function ProRegisterClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get('next') || '/contractors/network';

    const [firstName, setFirstName] = useState('');
    const [surname, setSurname] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const callbackUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `/auth/callback?next=${encodeURIComponent(next)}`;

    const canSubmit =
        firstName.trim().length > 0 &&
        surname.trim().length > 0 &&
        email.trim().length > 0 &&
        password.length >= 8;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await (supabase.auth as any).signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        first_name: firstName.trim(),
                        surname: surname.trim(),
                        profile_type: 'pro',
                    },
                    emailRedirectTo: callbackUrl,
                },
            });
            if (error) throw error;
            setDone(true);
        } catch (err: unknown) {
            toast.error(
                (err as { message?: string })?.message ||
                    'Could not create account. Please try again.'
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
                    {BRAND_NAME_PRO}
                </p>
            }
            rightSlot={
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/pro/auth/login${next !== '/contractors/network' ? `?next=${encodeURIComponent(next)}` : ''}`}>
                        Login
                    </Link>
                </Button>
            }
        />
    );

    if (done) {
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
                                            We sent a confirmation link to{' '}
                                            <span className="font-medium text-foreground">{email}</span>.
                                            Click it to activate your account.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="self-center text-muted-foreground"
                                        onClick={() => {
                                            setDone(false);
                                            setEmail('');
                                            setPassword('');
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
                                        Create Account
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

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="first-name">First Name</Label>
                                            <Input
                                                id="first-name"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                required
                                                autoComplete="given-name"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="surname">Surname</Label>
                                            <Input
                                                id="surname"
                                                value={surname}
                                                onChange={(e) => setSurname(e.target.value)}
                                                required
                                                autoComplete="family-name"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            autoComplete="email"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <Label htmlFor="password">Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                minLength={8}
                                                autoComplete="new-password"
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
                                    {loading ? 'Creating Account…' : 'Create Account'}
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
