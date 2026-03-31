'use client';

import { useState } from 'react';
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

type ContactFormProps = {
    /** Prefix for input ids so multiple instances on the same document never clash. */
    fieldIdPrefix?: string;
};

export function ContactForm({ fieldIdPrefix = 'contact' }: ContactFormProps) {
    const p = fieldIdPrefix;
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
                setError((data as { error?: string })?.error || 'Something went wrong. Please try again.');
                return;
            }
            setSubmitted(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    if (submitted) {
        return (
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
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Label htmlFor={`${p}-name`}>Name</Label>
                    <Input
                        id={`${p}-name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={120}
                        className="h-10"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <Label htmlFor={`${p}-email`}>Email</Label>
                    <Input
                        id={`${p}-email`}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="h-10"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor={`${p}-subject`}>Subject</Label>
                <Select value={subject} onValueChange={setSubject}>
                    <SelectTrigger id={`${p}-subject`} className="h-10">
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
                <Label htmlFor={`${p}-message`}>Message</Label>
                <Textarea
                    id={`${p}-message`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={6}
                    maxLength={5000}
                    className="resize-none text-sm [font-size:16px] md:text-sm"
                />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button
                type="submit"
                className="h-10 w-full sm:w-auto"
                disabled={submitting || !name || !email || !message}
            >
                {submitting ? 'Sending…' : 'Send Message'}
            </Button>
        </form>
    );
}
