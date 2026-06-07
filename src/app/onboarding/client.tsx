'use client';
/* eslint-disable no-console */

/**
 * Two-step homeowner onboarding (Phase 1 of the onboarding plan).
 *   Step 1 - capture the phone number (stored unverified for now), skippable.
 *   Step 2 - save the home address with a name (reuses /api/account/locations),
 *            skippable.
 *
 * Chrome matches /start: FlowTopBar with the brand centred, the avatar on the
 * right, and a centred StepHeading (title + subheading) per step. Fields match
 * the Settings forms (Label + Input with gap-3, no placeholder). The footer
 * matches the diagnosis page: a ghost skip button above a primary button.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FlowTopBar, StepHeading } from '@/components/match/flow-shell';
import { UserAvatar } from '@/components/user-avatar';
import { BRAND_NAME } from '@/lib/brand-system';
import { AddressAutocomplete, type SelectedPlace } from '@/components/address-autocomplete';
import { isValidSaMobile, formatSaPhoneInput } from '@/lib/phone';
import { toast } from 'sonner';

const SAVE_TIMEOUT_MS = 20_000;

export default function OnboardingClient({
    initialPhone,
    initialHasAddress,
}: {
    initialPhone: string | null;
    initialHasAddress: boolean;
}) {
    const router = useRouter();

    const [step, setStep] = useState<1 | 2>(initialPhone ? 2 : 1);

    const [phone, setPhone] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);

    const [addressName, setAddressName] = useState('Home');
    const [addressText, setAddressText] = useState('');
    const [place, setPlace] = useState<SelectedPlace | null>(null);
    const [savingAddress, setSavingAddress] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const phoneValid = useMemo(() => isValidSaMobile(phone), [phone]);
    const onStep1 = step === 1;

    const finish = useCallback(() => router.push('/home'), [router]);

    const goToAddressOrFinish = useCallback(() => {
        if (initialHasAddress) finish();
        else setStep(2);
    }, [initialHasAddress, finish]);

    const handleBack = useCallback(() => {
        if (step === 2 && !initialPhone) {
            setStep(1);
            return;
        }
        router.back();
    }, [step, initialPhone, router]);

    async function postJson(url: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
                console.error('[onboarding] save failed', url, res.status, json);
                return { ok: false, error: json?.error ?? `Could not save (HTTP ${res.status}).` };
            }
            return { ok: true };
        } catch (e) {
            const aborted = e instanceof DOMException && e.name === 'AbortError';
            console.error('[onboarding] save error', url, e);
            return {
                ok: false,
                error: aborted ? 'That took too long. Please try again.' : 'Network error. Please try again.',
            };
        } finally {
            clearTimeout(timer);
        }
    }

    const handleSavePhone = useCallback(async () => {
        if (savingPhone || !phoneValid) return;
        setError(null);
        setSavingPhone(true);
        const result = await postJson('/api/account/phone', { phone });
        setSavingPhone(false);
        if (!result.ok) {
            setError(result.error ?? 'Something went wrong.');
            toast.error(result.error ?? 'Something went wrong.');
            return;
        }
        goToAddressOrFinish();
    }, [savingPhone, phoneValid, phone, goToAddressOrFinish]);

    const handleSaveAddress = useCallback(async () => {
        if (savingAddress) return;
        if (!place) {
            toast.error('Select your address from the suggestions.');
            return;
        }
        if (!addressName.trim()) {
            toast.error('Give this address a name, like Home.');
            return;
        }
        setError(null);
        setSavingAddress(true);
        const result = await postJson('/api/account/locations', {
            label: addressName.trim(),
            address: place.address,
            lat: place.lat,
            lng: place.lng,
        });
        setSavingAddress(false);
        if (!result.ok) {
            setError(result.error ?? 'Something went wrong.');
            toast.error(result.error ?? 'Something went wrong.');
            return;
        }
        finish();
    }, [savingAddress, place, addressName, finish]);

    const handleSkip = useCallback(() => {
        if (onStep1) goToAddressOrFinish();
        else finish();
    }, [onStep1, goToAddressOrFinish, finish]);

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
                        onClick={handleBack}
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

            <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        <div className="flex flex-1 flex-col items-center justify-center p-4 min-h-0">
                            <div className="flex w-full max-w-xl flex-col gap-8">
                                {onStep1 ? (
                                    <>
                                        <StepHeading
                                            title="Phone Number"
                                            sub="We only share it with a specialist when you choose to contact them, so they can reach you about a job."
                                        />
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor="onboarding-phone">Phone Number</Label>
                                            <Input
                                                id="onboarding-phone"
                                                type="tel"
                                                inputMode="tel"
                                                autoFocus
                                                value={phone}
                                                onChange={(e) => {
                                                    setError(null);
                                                    setPhone(formatSaPhoneInput(e.target.value));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') void handleSavePhone();
                                                }}
                                            />
                                            {error ? (
                                                <p className="text-sm text-destructive">{error}</p>
                                            ) : null}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <StepHeading
                                            title="Add Address"
                                            sub="Save your home address so you do not have to enter it each time you ask for a diagnosis."
                                        />
                                        <div className="flex flex-col gap-6">
                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="onboarding-name">Name</Label>
                                                <Input
                                                    id="onboarding-name"
                                                    value={addressName}
                                                    onChange={(e) => setAddressName(e.target.value)}
                                                    maxLength={50}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-3">
                                                <Label htmlFor="onboarding-address">Address</Label>
                                                <AddressAutocomplete
                                                    id="onboarding-address"
                                                    value={addressText}
                                                    onChange={(v) => {
                                                        setError(null);
                                                        setAddressText(v);
                                                        setPlace(null);
                                                    }}
                                                    onSelect={(p) => {
                                                        setAddressText(p.address);
                                                        setPlace(p);
                                                    }}
                                                />
                                                {error ? (
                                                    <p className="text-sm text-destructive">{error}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="sticky bottom-0 shrink-0 bg-background p-4">
                            <div className="mx-auto w-full max-w-xl">
                                <div className="flex flex-col gap-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full text-muted-foreground"
                                        onClick={handleSkip}
                                    >
                                        Skip For Now
                                    </Button>
                                    {onStep1 ? (
                                        <Button
                                            type="button"
                                            className="w-full"
                                            disabled={!phoneValid || savingPhone}
                                            onClick={() => void handleSavePhone()}
                                        >
                                            {savingPhone ? 'Saving…' : 'Continue'}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            className="w-full"
                                            disabled={!place || !addressName.trim() || savingAddress}
                                            onClick={() => void handleSaveAddress()}
                                        >
                                            {savingAddress ? 'Saving…' : 'Finish'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
