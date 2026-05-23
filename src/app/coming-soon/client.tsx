'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Instagram, Mail, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ── Audience card ─────────────────────────────────────────────────────────────

function AudienceCard({
    zIndex,
    chipLabel,
    chipClass,
    heading,
    points,
}: {
    zIndex:     string;
    chipLabel:  string;
    chipClass:  string;
    heading:    string;
    points:     string[];
}) {
    return (
        <div className={`sticky top-0 h-screen ${zIndex} flex items-center justify-center bg-background px-6`}>
            <div className="flex flex-col gap-8 w-full max-w-xs">
                <div className="flex flex-col gap-3">
                    <span className={`inline-flex self-start rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-widest uppercase ${chipClass}`}>
                        {chipLabel}
                    </span>
                    <p className="text-sm font-medium">{heading}</p>
                </div>
                <div className="flex flex-col gap-6">
                    {points.map((point, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <p className="text-sm leading-snug">{point}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Contact + access card ────────────────────────────────────────────────────

function Card4() {
    const router = useRouter();
    const [name, setName]       = useState('');
    const [email, setEmail]     = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent]       = useState(false);
    const [contactErr, setContactErr] = useState('');

    const [code, setCode]           = useState('');
    const [codeErr, setCodeErr]     = useState('');
    const [codeLoading, setCodeLoading] = useState(false);
    const codeRef                   = useRef<HTMLInputElement>(null);

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
                // Use Next router so we keep client-side routing + cookies set
                // by /api/beta-access take effect immediately on the next render.
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
        <div className="sticky top-0 h-screen z-40 flex flex-col bg-card">
            <div className="flex flex-1 flex-col items-center justify-center">
                <div className="flex flex-col gap-6 w-full p-6 max-w-lg">

                    <div className="flex flex-col gap-3 text-center">
                        <span className="text-2xl text-foreground font-semibold">
                            Get Early Access
                        </span>
                        <p className="text-sm text-muted-foreground leading-relaxed">Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.</p>
                    </div>

                    {sent ? (
                        <p className="text-sm text-muted-foreground">...</p>
                    ) : (
                        <form onSubmit={handleContact} className="flex flex-col gap-3">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Full Name"
                                required
                                disabled={sending}
                                className="text-sm text-foreground h-11 px-3 py-2 border-input rounded-lg"
                            />
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email Address"
                                required
                                disabled={sending}
                                className="text-sm text-foreground h-11 px-3 py-2 border-input rounded-lg"
                            />
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Message"
                                rows={3}
                                required
                                disabled={sending}
                                className="text-sm text-foreground h-18 p-3 border-input rounded-lg"
                            />
                            {contactErr ? <p className="text-xs text-destructive">{contactErr}</p> : null}
                            <Button type="submit" disabled={sending || !name || !email || !message} className="w-full h-11 rounded-lg">
                                {sending ? 'Sending...' : 'Send Message'}
                            </Button>
                        </form>
                    )}

                    <div className="h-px bg-border" />

                    <form onSubmit={handleCode} className="flex flex-col gap-2">
                        <Input
                            ref={codeRef}
                            type="password"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Early access code"
                            autoComplete="current-password"
                            disabled={codeLoading}
                        />
                        {codeErr ? <p className="text-xs text-destructive">{codeErr}</p> : null}
                        <Button type="submit" variant="outline" disabled={codeLoading || !code.trim()} className="w-full">
                            {codeLoading ? 'Checking...' : 'Continue'}
                        </Button>
                    </form>

                </div>
            </div>

            <footer className="flex items-center justify-between border-t border-border py-4 text-xs text-muted-foreground">
                <span>© {new Date().getFullYear()} Mendr</span>
                <div className="flex items-center gap-4">
                    <a
                        href="https://www.instagram.com/mendrapp"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Mendr on Instagram"
                        className="hover:text-foreground transition-colors"
                    >
                        <Instagram size={15} />
                    </a>
                    <a
                        href="mailto:hello@mendr.co.za"
                        aria-label="Email Mendr"
                        className="hover:text-foreground transition-colors"
                    >
                        <Mail size={15} />
                    </a>
                </div>
            </footer>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ComingSoonClient() {
    return (
        <>
            {/* Card 1 — Hero */}
            <div className="sticky top-0 h-screen z-10 flex flex-col items-center justify-center bg-[#131312] text-[#FAFAFA] px-6">
                <div className="flex flex-col items-center gap-4 text-center max-w-xs">
                    <h1 className="text-5xl font-bold tracking-tight">Mendr</h1>
                    <p className="text-sm text-white/50 leading-relaxed">
                        Home fault diagnosis for Western Cape homeowners.
                    </p>
                </div>
                <div className="absolute bottom-8 flex flex-col items-center gap-1.5 text-white/20">
                    <span className="text-[10px] uppercase tracking-widest">Scroll</span>
                    <ChevronDown size={13} />
                </div>
            </div>

            {/* Card 2 — Homeowners */}
            <AudienceCard
                zIndex="z-20"
                chipLabel="For homeowners"
                chipClass="bg-[#DCF763] text-[#131312]"
                heading="Know what is wrong before you call anyone."
                points={[
                    'Upload a photo of any fault and get a written diagnosis in under 60 seconds',
                    'Understand the problem in plain language, not trade jargon',
                    'Compare vetted local contractors matched to your specific fault',
                    'Free to use, no account required',
                ]}
            />

            {/* Card 3 — Contractors */}
            <AudienceCard
                zIndex="z-30"
                chipLabel="For contractors"
                chipClass="bg-[#131312] text-[#FAFAFA]"
                heading="Leads who already understand their problem."
                points={[
                    'Get matched to homeowners with a written diagnosis in hand',
                    'No commission on jobs you win',
                    'Build a verified profile with real, structured reviews',
                    'Only relevant enquiries in your trade and service area',
                ]}
            />

            {/* Card 4 — Contact + access */}
            <Card4 />
        </>
    );
}
