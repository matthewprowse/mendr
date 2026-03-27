'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LandingHeader } from '@/components/landing-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const SUBJECTS = [
    'General question',
    'Provider enquiry',
    'Technical issue',
    'Partnership',
    'Other',
] as const;

export default function ContactPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, subject, message }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((data as any)?.error || 'Something went wrong. Please try again.');
                return;
            }
            setSubmitted(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <LandingHeader
                navLinks={[
                    { href: '/landing', label: 'For Homeowners' },
                    { href: '/pro/join', label: 'For Contractors' },
                ]}
                logoHref="/"
                showTrades={false}
            />

            <main className="flex-1">
                <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
                    <div className="mb-10 flex flex-col gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Got a question?
                        </h1>
                        <p className="text-base text-muted-foreground">
                            Whether you are a homeowner, a contractor, or just curious about how
                            Scandio works — we would love to hear from you.
                        </p>
                    </div>

                    {submitted ? (
                        <div className="rounded-xl border border-border/50 bg-muted/30 p-8 text-center">
                            <p className="text-base font-medium text-foreground">Message sent!</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Thank you for reaching out. We will be in touch shortly.
                            </p>
                            <Button
                                variant="secondary"
                                className="mt-6"
                                onClick={() => {
                                    setSubmitted(false);
                                    setName('');
                                    setEmail('');
                                    setSubject('');
                                    setMessage('');
                                }}
                            >
                                Send another message
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="contact-name">Name</Label>
                                    <Input
                                        id="contact-name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        maxLength={120}
                                        className="h-10"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="contact-email">Email</Label>
                                    <Input
                                        id="contact-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="h-10"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="contact-subject">Subject</Label>
                                <Select value={subject} onValueChange={setSubject}>
                                    <SelectTrigger id="contact-subject" className="h-10">
                                        <SelectValue placeholder="Select a subject" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SUBJECTS.map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label htmlFor="contact-message">Message</Label>
                                <Textarea
                                    id="contact-message"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    required
                                    rows={6}
                                    maxLength={5000}
                                    className="resize-none text-sm"
                                />
                            </div>

                            {error && <p className="text-sm text-destructive">{error}</p>}

                            <Button
                                type="submit"
                                className="h-10 w-full sm:w-auto"
                                disabled={submitting || !name || !email || !message}
                            >
                                {submitting ? 'Sending…' : 'Send Message'}
                            </Button>
                        </form>
                    )}
                </section>
            </main>

            <footer className="border-t border-border/50 bg-background py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                            &copy; {new Date().getFullYear()} Scandio. All rights reserved.
                        </p>
                        <nav className="flex gap-4">
                            <Link href="/landing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                For Homeowners
                            </Link>
                            <Link href="/pro/join" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                For Contractors
                            </Link>
                        </nav>
                    </div>
                </div>
            </footer>
        </div>
    );
}
