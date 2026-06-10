'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { FlowTopBar } from '@/components/match/flow-shell';
import { BRAND_NAME } from '@/lib/brand-system';

// ── Page ──────────────────────────────────────────────────────────────────────
// Standard app shell (same as /settings, /start, /login): a sticky top bar and a
// single scrolling content column. Launching-soon hero + early-access code, then
// a request-access form.

export function ComingSoonClient() {
    const router = useRouter();

    // Contact / request-access form.
    const [name, setName]       = useState('');
    const [email, setEmail]     = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent]       = useState(false);
    const [contactErr, setContactErr] = useState('');

    // Early-access code form.
    const [code, setCode]               = useState('');
    const [codeErr, setCodeErr]         = useState('');
    const [codeLoading, setCodeLoading] = useState(false);
    const codeRef                       = useRef<HTMLInputElement>(null);

    async function handleContact(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        setContactErr('');
        try {
            const res = await fetch('/api/contact', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name, email, message, subject: 'General question' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Something went wrong.');
            setSent(true);
        } catch (err) {
            setContactErr(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setSending(false);
        }
    }

    async function handleCode(e: React.FormEvent) {
        e.preventDefault();
        if (!code.trim()) return;
        setCodeLoading(true);
        setCodeErr('');
        try {
            const res = await fetch('/api/beta-access', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ password: code.trim() }),
            });
            if (res.ok) {
                // Next router keeps client-side routing + lets the cookie set by
                // /api/beta-access take effect on the next render.
                router.push('/');
                router.refresh();
            } else {
                setCodeErr('Incorrect code.');
                setCode('');
                codeRef.current?.focus();
            }
        } catch {
            setCodeErr('Something went wrong. Please try again.');
        } finally {
            setCodeLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            <FlowTopBar
                className="p-4"
                leftSlot={<span aria-hidden className="block size-10" />}
                centerSlot={
                    <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium text-foreground">
                        {BRAND_NAME}
                    </p>
                }
            />

            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex flex-1 flex-col items-center justify-center p-4">
                            <div className="flex w-full max-w-xl flex-col gap-8 py-8">

                                {/* Hero */}
                                <div className="flex w-full flex-col items-center gap-3 text-center">
                                    <h1 className="text-2xl font-semibold text-foreground">Launching Soon</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Mendr is home fault diagnosis for Western Cape homeowners. Enter your early access code to step inside, or request one below.
                                    </p>
                                </div>

                                {/* Early-access code */}
                                <form onSubmit={handleCode} className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-3">
                                        <Label htmlFor="access-code">Early Access Code</Label>
                                        <Input
                                            id="access-code"
                                            ref={codeRef}
                                            type="password"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            autoComplete="current-password"
                                            disabled={codeLoading}
                                        />
                                    </div>
                                    {codeErr ? <p className="text-sm text-destructive">{codeErr}</p> : null}
                                    <Button type="submit" className="w-full" disabled={codeLoading || !code.trim()}>
                                        {codeLoading ? 'Checking…' : 'Continue'}
                                    </Button>
                                </form>

                                <Separator />

                                {/* Request access / contact */}
                                {sent ? (
                                    <p className="text-center text-sm text-muted-foreground">
                                        Thanks, we&apos;ve got it. We&apos;ll be in touch soon.
                                    </p>
                                ) : (
                                    <form onSubmit={handleContact} className="flex flex-col gap-6">
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="ra-name">Full Name</Label>
                                            <Input
                                                id="ra-name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required
                                                disabled={sending}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="ra-email">Email Address</Label>
                                            <Input
                                                id="ra-email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                disabled={sending}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="ra-message">Message</Label>
                                            <Textarea
                                                id="ra-message"
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                rows={4}
                                                required
                                                disabled={sending}
                                            />
                                        </div>
                                        {contactErr ? <p className="text-sm text-destructive">{contactErr}</p> : null}
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            className="w-full"
                                            disabled={sending || !name || !email || !message}
                                        >
                                            {sending ? 'Sending…' : 'Send Message'}
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* Footer — contact email on the left, socials on the right. */}
                        <footer className="h-18 shrink-0 px-4 py-1">
                            <div className="mx-auto flex h-full w-full max-w-xl items-center justify-between">
                                <a
                                    href="mailto:hello@mendr.co.za"
                                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    hello@mendr.co.za
                                </a>
                                <div className="flex items-center gap-4">
                                    <a
                                        href="https://www.instagram.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        Instagram
                                    </a>
                                    <a
                                        href="https://www.facebook.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        Facebook
                                    </a>
                                </div>
                            </div>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );
}
