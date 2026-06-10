'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type EditableProfile = {
    name: string;
    summary_long: string;
    about: string;
    past_work: string;
    website: string;
    phone: string;
    highlights: string;
    specialisations: string;
    years_in_business: string;
};

const SUMMARY_MAX = 1800;

function splitCsv(value: string): string[] {
    return value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

function Field({
    label,
    htmlFor,
    count,
    max,
    children,
}: {
    label: string;
    htmlFor: string;
    count?: number;
    max?: number;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={htmlFor}>{label}</Label>
                {typeof count === 'number' && max ? (
                    <span className="text-xs text-muted-foreground">
                        {count} / {max}
                    </span>
                ) : null}
            </div>
            {children}
        </div>
    );
}

export default function EditProfileClient({
    initial,
    canEdit,
}: {
    initial: EditableProfile;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [form, setForm] = useState<EditableProfile>(initial);
    const [saving, setSaving] = useState(false);
    const [yearsError, setYearsError] = useState<string | null>(null);

    function set<K extends keyof EditableProfile>(key: K, value: string) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canEdit || saving) return;

        const years = form.years_in_business.trim();
        if (years && !/^\d{1,3}$/.test(years)) {
            setYearsError('Enter a whole number of years.');
            return;
        }
        setYearsError(null);

        setSaving(true);
        try {
            const res = await fetch('/api/pro/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile: {
                        name: form.name.trim(),
                        summary_long: form.summary_long,
                        about: form.about,
                        past_work: form.past_work,
                        website: form.website.trim(),
                        phone: form.phone.trim(),
                        highlights: splitCsv(form.highlights),
                        specialisations: splitCsv(form.specialisations),
                        years_in_business: years === '' ? null : Number(years),
                    },
                }),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
            if (!res.ok || !json?.ok) {
                toast.error(json?.error ?? 'Could not save your profile.');
                return;
            }
            toast.success('Profile saved.');
            router.push('/pro/account');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="flex w-full flex-col gap-3">
                <h1 className="text-2xl font-semibold text-foreground">Edit Profile</h1>
                <p className="text-sm text-muted-foreground">
                    Update the details homeowners see on your public profile.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <Field label="Business Name" htmlFor="name">
                    <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Your business name"
                    />
                </Field>

                <Field
                    label="Summary"
                    htmlFor="summary_long"
                    count={form.summary_long.length}
                    max={SUMMARY_MAX}
                >
                    <Textarea
                        id="summary_long"
                        value={form.summary_long}
                        onChange={(e) => set('summary_long', e.target.value.slice(0, SUMMARY_MAX))}
                        disabled={!canEdit}
                        rows={5}
                        placeholder="A short overview of what you do and the areas you cover."
                    />
                </Field>

                <Field label="About" htmlFor="about">
                    <Textarea
                        id="about"
                        value={form.about}
                        onChange={(e) => set('about', e.target.value)}
                        disabled={!canEdit}
                        rows={4}
                        placeholder="More detail about your business, experience, and approach."
                    />
                </Field>

                <Field label="Past Work" htmlFor="past_work">
                    <Textarea
                        id="past_work"
                        value={form.past_work}
                        onChange={(e) => set('past_work', e.target.value)}
                        disabled={!canEdit}
                        rows={4}
                        placeholder="Examples of jobs you have completed."
                    />
                </Field>

                <Field label="Website" htmlFor="website">
                    <Input
                        id="website"
                        type="url"
                        inputMode="url"
                        value={form.website}
                        onChange={(e) => set('website', e.target.value)}
                        disabled={!canEdit}
                        placeholder="https://"
                    />
                </Field>

                <Field label="Phone" htmlFor="phone">
                    <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => set('phone', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Contact number"
                    />
                </Field>

                <Field label="Years In Business" htmlFor="years_in_business">
                    <Input
                        id="years_in_business"
                        inputMode="numeric"
                        value={form.years_in_business}
                        onChange={(e) => set('years_in_business', e.target.value)}
                        disabled={!canEdit}
                        placeholder="e.g. 8"
                        aria-invalid={yearsError ? true : undefined}
                    />
                    {yearsError ? <p className="text-sm text-destructive">{yearsError}</p> : null}
                </Field>

                <Field label="Specialisations" htmlFor="specialisations">
                    <Input
                        id="specialisations"
                        value={form.specialisations}
                        onChange={(e) => set('specialisations', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Comma separated, e.g. Geysers, Leak Detection"
                    />
                </Field>

                <Field label="Highlights" htmlFor="highlights">
                    <Input
                        id="highlights"
                        value={form.highlights}
                        onChange={(e) => set('highlights', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Comma separated, e.g. Same-day callouts, Free quotes"
                    />
                </Field>

                {!canEdit ? (
                    <p className="text-sm text-muted-foreground">
                        Only owners and admins can edit the business profile.
                    </p>
                ) : null}

                <Button type="submit" className="w-full" disabled={!canEdit || saving}>
                    {saving ? 'Saving…' : 'Save Profile'}
                </Button>
            </form>
        </>
    );
}
