'use client';

/**
 * SupportClient — basic contact form for support requests.
 *
 * Logged-in users get their name + email pre-filled from their profile and
 * cannot edit those fields (the message arrives in our inbox tied to a known
 * account). Posts to the existing /api/contact endpoint, which inserts a row
 * into contact_messages and emails the admin inbox.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { FlowTopBar } from '@/components/match/flow-shell';
import { AccountTabBar } from '@/components/account-tab-bar';
import { BRAND_NAME } from '@/lib/brand-system';
import { useAuth } from '@/context/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import { toast } from 'sonner';

const SUBJECTS = [
    'General Question',
    'Request Assistance',
    'Contractor Feedback',
    'Technical Issue',
    'Other',
] as const;

const MAX_CHARS = 500;

/**
 * Normalises any South African phone input to "+27 XX XXX XXXX".
 * Handles 0815956488, 081 595 6488, +27 81 595 6488, 27815956488, etc.
 * Silently caps at 9 local digits so the output never exceeds the full format.
 */
function formatSAPhone(input: string): string {
    const digits = input.replace(/\D/g, '');

    // Strip country/area code prefix to get the 9 local digits
    let local: string;
    if (digits.startsWith('27') && digits.length > 2) {
        local = digits.slice(2);
    } else if (digits === '27') {
        return '+27';
    } else if (digits.startsWith('0')) {
        local = digits.slice(1);
    } else {
        local = digits;
    }

    local = local.slice(0, 9);
    if (!local) return digits.length > 0 ? '+27' : '';

    const p1 = local.slice(0, 2);
    const p2 = local.slice(2, 5);
    const p3 = local.slice(5);

    let result = '+27';
    if (p1) result += ' ' + p1;
    if (p2) result += ' ' + p2;
    if (p3) result += ' ' + p3;
    return result;
}

type Profile = {
    email: string | null;
    firstName: string;
    surname: string;
};

export default function SupportClient() {
    const router = useRouter();
    const { user } = useAuth();
    const isLoggedIn = Boolean(user && user.email);

    const [profile, setProfile] = useState<Profile | null>(null);
    const [firstName, setFirstName] = useState('');
    const [surname, setSurname] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [subject, setSubject] = useState<string>(SUBJECTS[0]);
    const [description, setDescription] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch('/api/account/profile')
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((data: Profile) => {
                if (cancelled) return;
                setProfile(data);
                setFirstName(data.firstName ?? '');
                setSurname(data.surname ?? '');
                setEmail(data.email ?? '');
            })
            .catch(() => {
                // Soft-fail: the user can still submit by typing their details.
            });
        return () => {
            cancelled = true;
        };
    }, [isLoggedIn]);

    const handleSubmit = useCallback(async () => {
        if (sending) return;
        const trimmedDescription = description.trim();
        if (!trimmedDescription) {
            toast.error('Add a short description.');
            return;
        }
        if (!firstName.trim() || !surname.trim() || !email.trim()) {
            toast.error('First name, surname, and email are required.');
            return;
        }
        setSending(true);
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `${firstName.trim()} ${surname.trim()}`,
                    email: email.trim(),
                    phone: phone.trim() || undefined,
                    subject,
                    message: trimmedDescription,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
            };
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'Could not send message.');
            }
            setSent(true);
            setDescription('');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not send message.');
        } finally {
            setSending(false);
        }
    }, [sending, firstName, surname, email, phone, subject, description]);

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
            rightSlot={<UserAvatar />}
        />
    );

    if (!isLoggedIn) {
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
                                            Support
                                        </h1>
                                        <p className="text-sm text-muted-foreground">
                                            Log in to send us a message.
                                        </p>
                                    </div>
                                    <Button asChild>
                                        <Link href="/auth/login?next=/settings/support">
                                            Log In
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            <AccountTabBar />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isLoading = profile === null;
    const profileLoaded = profile !== null;

    return (
        <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background">
            {header}
            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex-1 flex flex-col p-4">
                            <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                                <div className="flex w-full flex-col gap-3">
                                    <h1 className="text-2xl font-semibold text-foreground">
                                        Support
                                    </h1>
                                    <p className="text-sm text-muted-foreground">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore.
                                    </p>
                                </div>

                                {isLoading ? (
                                    /*
                                     * SKELETON — mirrors the support form rendered below once
                                     * the user's profile pre-fills name + email:
                                     *   2-col name grid (First Name · Surname).
                                     *   Email field.
                                     *   Phone field (with Optional label on the right + hint).
                                     *   Subject select (h-10).
                                     *   Description textarea (rows={6} ≈ h-36) + char counter
                                     *   + hint.
                                     *   Send Message button.
                                     * ⚠️ If you add, remove, or resize any field in the form
                                     * below, update this skeleton to match so there is no
                                     * layout shift when data arrives.
                                     */
                                    <div className="flex flex-col gap-6">
                                        {/* First Name + Surname */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-10 w-full rounded-md" />
                                            </div>
                                        </div>
                                        {/* Email */}
                                        <div className="flex flex-col gap-3">
                                            <Skeleton className="h-3.5 w-1/4 rounded" />
                                            <Skeleton className="h-10 w-full rounded-md" />
                                        </div>
                                        {/* Phone (Optional) */}
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-3 w-12 rounded" />
                                            </div>
                                            <Skeleton className="h-10 w-full rounded-md" />
                                            <Skeleton className="h-3 w-3/5 rounded" />
                                        </div>
                                        {/* Subject select */}
                                        <div className="flex flex-col gap-3">
                                            <Skeleton className="h-3.5 w-1/4 rounded" />
                                            <Skeleton className="h-10 w-full rounded-md" />
                                        </div>
                                        {/* Description textarea (rows={6}) + char counter + hint */}
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Skeleton className="h-3.5 w-1/4 rounded" />
                                                <Skeleton className="h-3 w-10 rounded" />
                                            </div>
                                            <Skeleton className="h-36 w-full rounded-md" />
                                            <Skeleton className="h-3 w-3/5 rounded" />
                                        </div>
                                        {/* Send Message button */}
                                        <Skeleton className="h-10 w-full rounded-md" />
                                    </div>
                                ) : null}

                                {sent ? (
                                    <div className="flex flex-col gap-6 rounded-lg border bg-card p-6 text-center">
                                        <h2 className="text-base font-semibold text-foreground">
                                            Message Sent
                                        </h2>
                                        <p className="text-sm text-muted-foreground">
                                            Thank you. We will reply to{' '}
                                            <span className="font-medium text-foreground">
                                                {email}
                                            </span>{' '}
                                            shortly.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setSent(false)}
                                        >
                                            Send Another Message
                                        </Button>
                                    </div>
                                ) : null}

                                {profileLoaded && !sent ? (
                                    <div className="flex flex-col gap-6">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="support-first-name">First Name</Label>
                                                <Input
                                                    id="support-first-name"
                                                    value={firstName}
                                                    onChange={(e) => setFirstName(e.target.value)}
                                                    autoComplete="given-name"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="support-surname">Surname</Label>
                                                <Input
                                                    id="support-surname"
                                                    value={surname}
                                                    onChange={(e) => setSurname(e.target.value)}
                                                    autoComplete="family-name"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="support-email">Email Address</Label>
                                            <Input
                                                id="support-email"
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                autoComplete="email"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="support-phone">Contact Number</Label>
                                                <span className="text-xs text-muted-foreground">Optional</span>
                                            </div>
                                            <Input
                                                id="support-phone"
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(formatSAPhone(e.target.value))}
                                                autoComplete="tel"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="support-subject">Subject</Label>
                                            <Select
                                                value={subject}
                                                onValueChange={setSubject}
                                            >
                                                <SelectTrigger
                                                    id="support-subject"
                                                    className="w-full"
                                                >
                                                    <SelectValue />
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

                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="support-description">Description</Label>
                                                <span className="text-xs text-muted-foreground">
                                                    {description.length} / {MAX_CHARS}
                                                </span>
                                            </div>
                                            <Textarea
                                                id="support-description"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                maxLength={MAX_CHARS}
                                                rows={6}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                            </p>
                                        </div>

                                        <Button
                                            type="button"
                                            className="w-full"
                                            disabled={sending || !description.trim()}
                                            onClick={() => void handleSubmit()}
                                        >
                                            {sending ? 'Sending…' : 'Send Message'}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <AccountTabBar />
                    </div>
                </div>
            </div>
        </div>
    );
}
