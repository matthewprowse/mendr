'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export type ProfileSettings = {
    insurance_cover: string;
    typical_response_time: string;
    pricing_model: string;
    callout_fee: number | null;
    preferred_contact_channel: string;
    notify_realtime: boolean;
};

export type NotificationSettings = {
    new_enquiry: boolean;
    new_review: boolean;
    weekly_summary: boolean;
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
    preferred_channel: string;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function ToggleRow({
    label,
    description,
    checked,
    onChange,
    disabled,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description ? (
                    <p className="text-xs text-muted-foreground">{description}</p>
                ) : null}
            </div>
            <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </div>
    );
}

export default function SettingsClient({
    profile: initialProfile,
    notifications: initialNotifications,
    canEditProfile,
}: {
    profile: ProfileSettings;
    notifications: NotificationSettings;
    canEditProfile: boolean;
}) {
    const [profile, setProfile] = useState(initialProfile);
    const [notifications, setNotifications] = useState(initialNotifications);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingNotif, setSavingNotif] = useState(false);

    const patch = async (
        payload: Record<string, unknown>,
        setBusy: (v: boolean) => void,
    ): Promise<void> => {
        setBusy(true);
        try {
            const res = await fetch('/api/pro/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Could not save.');
                return;
            }
            toast.success('Saved.');
        } catch {
            toast.error('Network error. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const saveProfile = () =>
        patch(
            {
                profile: {
                    ...profile,
                    callout_fee:
                        profile.callout_fee === null || Number.isNaN(profile.callout_fee)
                            ? null
                            : profile.callout_fee,
                },
            },
            setSavingProfile,
        );

    const saveNotifications = () => patch({ notifications }, setSavingNotif);

    return (
        <>
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground">
                    Your business profile and how we let you know about activity.
                </p>
            </div>

            <Link
                href="/pro/plan"
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
                <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground">Plan</p>
                    <p className="text-xs text-muted-foreground">View and change your plan.</p>
                </div>
                <span aria-hidden className="shrink-0 text-muted-foreground">
                    &rsaquo;
                </span>
            </Link>

            {/* Business profile */}
            <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-foreground">Business Profile</h2>
                {!canEditProfile ? (
                    <p className="text-sm text-muted-foreground">
                        Only owners and admins can edit the business profile.
                    </p>
                ) : null}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="insurance">Insurance Cover</Label>
                    <Input
                        id="insurance"
                        value={profile.insurance_cover}
                        disabled={!canEditProfile}
                        onChange={(e) =>
                            setProfile((p) => ({ ...p, insurance_cover: e.target.value }))
                        }
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="response">Typical Response Time</Label>
                    <Input
                        id="response"
                        placeholder="Within 24 hours"
                        value={profile.typical_response_time}
                        disabled={!canEditProfile}
                        onChange={(e) =>
                            setProfile((p) => ({ ...p, typical_response_time: e.target.value }))
                        }
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pricing">Pricing Model</Label>
                    <Input
                        id="pricing"
                        placeholder="Fixed quote after a callout"
                        value={profile.pricing_model}
                        disabled={!canEditProfile}
                        onChange={(e) =>
                            setProfile((p) => ({ ...p, pricing_model: e.target.value }))
                        }
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="callout">Callout Fee</Label>
                    <Input
                        id="callout"
                        inputMode="decimal"
                        placeholder="0"
                        value={profile.callout_fee ?? ''}
                        disabled={!canEditProfile}
                        onChange={(e) =>
                            setProfile((p) => ({
                                ...p,
                                callout_fee:
                                    e.target.value === '' ? null : Number(e.target.value),
                            }))
                        }
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="contact-channel">Preferred Contact Channel</Label>
                    <NativeSelect
                        id="contact-channel"
                        className="w-full"
                        value={profile.preferred_contact_channel}
                        disabled={!canEditProfile}
                        onChange={(e) =>
                            setProfile((p) => ({
                                ...p,
                                preferred_contact_channel: e.target.value,
                            }))
                        }
                    >
                        <NativeSelectOption value="">No Preference</NativeSelectOption>
                        <NativeSelectOption value="whatsapp">WhatsApp</NativeSelectOption>
                        <NativeSelectOption value="phone">Phone Call</NativeSelectOption>
                        <NativeSelectOption value="sms">SMS</NativeSelectOption>
                        <NativeSelectOption value="email">Email</NativeSelectOption>
                    </NativeSelect>
                </div>
                <ToggleRow
                    label="Realtime Enquiry Alerts"
                    description="Be notified the moment a new enquiry comes in."
                    checked={profile.notify_realtime}
                    disabled={!canEditProfile}
                    onChange={(v) => setProfile((p) => ({ ...p, notify_realtime: v }))}
                />
                {canEditProfile ? (
                    <Button
                        className="w-fit"
                        disabled={savingProfile}
                        onClick={() => void saveProfile()}
                    >
                        {savingProfile ? 'Saving…' : 'Save Profile'}
                    </Button>
                ) : null}
                <Link
                    href="/pro/account/service-area"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    Edit your service area
                </Link>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
                <ToggleRow
                    label="New Enquiry"
                    description="A homeowner asks to be connected with you."
                    checked={notifications.new_enquiry}
                    onChange={(v) => setNotifications((n) => ({ ...n, new_enquiry: v }))}
                />
                <ToggleRow
                    label="New Review"
                    description="A customer rates a completed job."
                    checked={notifications.new_review}
                    onChange={(v) => setNotifications((n) => ({ ...n, new_review: v }))}
                />
                <ToggleRow
                    label="Weekly Summary"
                    description="A roundup of your week every Monday."
                    checked={notifications.weekly_summary}
                    onChange={(v) => setNotifications((n) => ({ ...n, weekly_summary: v }))}
                />
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notify-channel">Preferred Channel</Label>
                    <NativeSelect
                        id="notify-channel"
                        className="w-full"
                        value={notifications.preferred_channel}
                        onChange={(e) =>
                            setNotifications((n) => ({
                                ...n,
                                preferred_channel: e.target.value,
                            }))
                        }
                    >
                        <NativeSelectOption value="email">Email</NativeSelectOption>
                        <NativeSelectOption value="whatsapp">WhatsApp</NativeSelectOption>
                        <NativeSelectOption value="sms">SMS</NativeSelectOption>
                    </NativeSelect>
                </div>
                <div className="flex gap-3">
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="quiet-start">Quiet Hours From</Label>
                        <NativeSelect
                            id="quiet-start"
                            className="w-full"
                            value={notifications.quiet_hours_start ?? ''}
                            onChange={(e) =>
                                setNotifications((n) => ({
                                    ...n,
                                    quiet_hours_start:
                                        e.target.value === '' ? null : Number(e.target.value),
                                }))
                            }
                        >
                            <NativeSelectOption value="">Off</NativeSelectOption>
                            {HOURS.map((h) => (
                                <NativeSelectOption key={h} value={h}>
                                    {hourLabel(h)}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Label htmlFor="quiet-end">Quiet Hours To</Label>
                        <NativeSelect
                            id="quiet-end"
                            className="w-full"
                            value={notifications.quiet_hours_end ?? ''}
                            onChange={(e) =>
                                setNotifications((n) => ({
                                    ...n,
                                    quiet_hours_end:
                                        e.target.value === '' ? null : Number(e.target.value),
                                }))
                            }
                        >
                            <NativeSelectOption value="">Off</NativeSelectOption>
                            {HOURS.map((h) => (
                                <NativeSelectOption key={h} value={h}>
                                    {hourLabel(h)}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>
                </div>
                <Button
                    className="w-fit"
                    disabled={savingNotif}
                    onClick={() => void saveNotifications()}
                >
                    {savingNotif ? 'Saving…' : 'Save Notifications'}
                </Button>
            </div>
        </>
    );
}
