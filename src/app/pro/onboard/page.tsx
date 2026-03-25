'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FlowStepHeader } from '@/components/flow-header';
import { getSupabase } from '@/lib/supabase';
import { geocodeApi } from '@/features/match/api/client';
import type { MatchLocation } from '@/features/match/contracts';
import { useMatchMap } from '@/features/match/hooks/useMatchMap';

// ─── Types ────────────────────────────────────────────────────────────────────

type Service = { id: string; label: string };

const TOTAL_STEPS = 6;

// ─── Form data ────────────────────────────────────────────────────────────────

type FormData = {
    businessName: string;
    contactName: string;
    email: string;
    phone: string;
    website: string;
    // Trades: map of service label → sub-trades text (stored as entered)
    selectedTrades: Record<string, string>;
    // The trade the user last clicked (to add sub-trades for)
    focusedTrade: string | null;
    workLocation: MatchLocation | null;
    yearsExperience: string;
    teamSize: string;
    registrationNumber: string;
    about: string;
    referral: string;
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
    return (
        <div className="fixed inset-x-0 top-0 z-50 h-[2px] bg-border/50">
            <div
                className="h-full bg-foreground transition-all duration-500 ease-out"
                style={{ width: `${((step) / TOTAL_STEPS) * 100}%` }}
            />
        </div>
    );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({
    data,
    onChange,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Header Name
                </h1>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
                </p>
            </div>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <Label>Business Name</Label>
                    <Input
                        id="businessName"
                        className="h-10 w-full text-sm"
                        value={data.businessName}
                        onChange={(e) => onChange({ businessName: e.target.value })}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="contactName">Full Name</Label>
                    <Input
                        id="contactName"
                        className="h-10 w-full text-sm"
                        value={data.contactName}
                        onChange={(e) => onChange({ contactName: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
}

function Step2({
    data,
    onChange,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Header Name
                </h1>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
                </p>
            </div>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <Label htmlFor="email">Address</Label>
                    <Input
                        id="email"
                        type="email"
                        className="h-10 w-full text-sm"
                        value={data.email}
                        onChange={(e) => onChange({ email: e.target.value })}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-10 w-full text-sm"
                        value={data.phone}
                        onChange={(e) => onChange({ phone: e.target.value })}
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="website">
                        Website
                    </Label>
                    <Input
                        id="website"
                        type="url"
                        className="h-10 w-full text-sm"
                        value={data.website}
                        onChange={(e) => onChange({ website: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
}

function Step3({
    data,
    onChange,
    services,
    servicesLoading,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
    services: Service[];
    servicesLoading: boolean;
}) {
    const focused = data.focusedTrade;

    function updateSubTradesRaw(text: string) {
        if (!focused) return;
        onChange({ selectedTrades: { ...data.selectedTrades, [focused]: text } });
    }

    const focusedText = focused ? (data.selectedTrades[focused] ?? '') : '';

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Header Name
                </h1>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="main-trade-select">Service</Label>
                {servicesLoading ? (
                    <div className="h-10 w-full animate-pulse rounded-md border border-border/50 bg-muted/40" />
                ) : (
                    <Select
                        value={focused ?? undefined}
                        onValueChange={(label) => onChange({ focusedTrade: label })}
                        disabled={services.length === 0}
                    >
                        <SelectTrigger
                            id="main-trade-select"
                            className="w-full h-10 text-sm"
                        >
                            <SelectValue placeholder="Select Service" />
                        </SelectTrigger>
                        <SelectContent>
                            {services.map(({ id, label }) => (
                                <SelectItem key={id} value={label}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="sub-trades-input">
                    {focused ? `Description` : 'Description'}
                </Label>
                <Textarea
                    id="sub-trades-input"
                    value={focusedText}
                    onChange={(e) => updateSubTradesRaw(e.target.value)}
                    rows={3}
                    className="text-sm"
                    disabled={!focused}
                />
            </div>
        </div>
    );
}

function Step4({
    data,
    onChange,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
}) {
    const [addressInput, setAddressInput] = useState('');
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        if (!data.workLocation) return;
        setAddressInput(
            data.workLocation.address || `${data.workLocation.lat}, ${data.workLocation.lng}`,
        );
    }, [data.workLocation]);

    const { mapHostRef } = useMatchMap({
        userLocation: data.workLocation,
        providers: [],
        searchRadiusMeters: 0,
        showSearchRadius: false,
        showUserPin: true,
    });

    const resolveAddress = useCallback(async () => {
        const trimmed = addressInput.trim();
        if (!trimmed) {
            toast.error('Enter an address first');
            return;
        }

        setIsResolving(true);
        try {
            const coordMatch = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
            const isCoords = Boolean(coordMatch);

            const geo = await geocodeApi(
                isCoords
                    ? {
                          lat: Number(coordMatch?.[1]),
                          lng: Number(coordMatch?.[2]),
                          westernCapeOnly: true,
                      }
                    : { address: trimmed, westernCapeOnly: true },
            );

            if (
                !geo ||
                typeof geo.lat !== 'number' ||
                typeof geo.lng !== 'number' ||
                !Number.isFinite(geo.lat) ||
                !Number.isFinite(geo.lng) ||
                (typeof geo.address !== 'string' && typeof geo.address !== 'undefined')
            ) {
                toast.error(geo?.error || 'Failed to find that address');
                return;
            }

            const loc: MatchLocation = {
                lat: geo.lat,
                lng: geo.lng,
                address: typeof geo.address === 'string' ? geo.address : trimmed,
            };
            onChange({ workLocation: loc });
            setAddressInput(loc.address);
        } finally {
            setIsResolving(false);
        }
    }, [addressInput, onChange]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Where do you work?
                </h1>
                <p className="text-sm text-muted-foreground">
                    Address search is limited to Western Cape, South Africa. Press Enter to look up
                    and show the map.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="onboard-work-address">Address</Label>
                <Input
                    id="onboard-work-address"
                    className="h-10 text-sm"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        void resolveAddress();
                    }}
                    disabled={isResolving}
                    autoFocus
                />
            </div>

            <div className="relative flex min-h-[220px] w-full overflow-hidden rounded-lg bg-secondary sm:min-h-[280px]">
                <div ref={mapHostRef} className="absolute inset-0 w-full h-full rounded-lg" />
                {!data.workLocation || isResolving ? (
                    <p className="relative z-10 m-auto max-w-[90%] text-center text-xs text-muted-foreground">
                        {isResolving
                            ? 'Searching'
                            : 'Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos.'}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function Step5({
    data,
    onChange,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
}) {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Almost done
                </h1>
                <p className="text-sm text-muted-foreground">
                    A few details about your operation. Registration, about, and referral are optional.
                </p>
            </div>
            <div className="flex flex-col gap-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-3">
                        <Label htmlFor="years">Years in business</Label>
                        <Input
                            id="years"
                            type="number"
                            min="0"
                            max="100"
                            placeholder="e.g. 10"
                            value={data.yearsExperience}
                            onChange={(e) => onChange({ yearsExperience: e.target.value })}
                            className="h-10 text-sm"
                            autoFocus
                        />
                    </div>
                    <div className="flex flex-col gap-3">
                        <Label htmlFor="teamSize">Team size</Label>
                        <Input
                            id="teamSize"
                            type="number"
                            min="1"
                            placeholder="Including yourself"
                            value={data.teamSize}
                            onChange={(e) => onChange({ teamSize: e.target.value })}
                            className="h-10 text-sm"
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-row justify-between items-center">
                        <Label htmlFor="regNo">
                            Registration Number
                        </Label>
                        <Badge variant="secondary">Optional</Badge>
                    </div>
                    <Input
                        id="regNo"
                        value={data.registrationNumber}
                        onChange={(e) => onChange({ registrationNumber: e.target.value })}
                        className="h-10 text-sm"
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="about">
                        About your business
                    </Label>
                    <Textarea
                        id="about"
                        value={data.about}
                        onChange={(e) => onChange({ about: e.target.value })}
                        rows={6}
                        className="text-sm"
                    />
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="referral">
                        Referral Source
                    </Label>
                    <Input
                        id="referral"
                        value={data.referral}
                        onChange={(e) => onChange({ referral: e.target.value })}
                        className="h-10 text-sm"
                    />
                </div>
            </div>
        </div>
    );
}

function Step6({
    data,
}: {
    data: FormData;
}) {
    const totalSubTrades = Object.values(data.selectedTrades).reduce((n, raw) => {
        const parts = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        return n + parts.length;
    }, 0);
    const trades = Object.entries(data.selectedTrades)
        .filter(([, raw]) => raw.trim().length > 0)
        .map(([trade]) => trade);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    You&apos;re ready to join.
                </h1>
                <p className="text-base text-muted-foreground">
                    Here&apos;s a summary of your application. Submit when you&apos;re happy.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                {/* Business */}
                <SummaryCard label="Business">
                    <p className="text-sm text-foreground font-medium">{data.businessName || '—'}</p>
                    <p className="text-sm text-muted-foreground">{data.contactName || '—'}</p>
                </SummaryCard>

                {/* Contact */}
                <SummaryCard label="Contact">
                    <p className="text-sm text-foreground">{data.email || '—'}</p>
                    <p className="text-sm text-muted-foreground">{data.phone || '—'}</p>
                    {data.website && (
                        <p className="text-sm text-muted-foreground">{data.website}</p>
                    )}
                </SummaryCard>

                {/* Trades */}
                <SummaryCard label={`Trades & Sub-trades (${totalSubTrades} selected)`}>
                    {trades.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None selected</p>
                    ) : (
                        trades.map((trade) => (
                            <div key={trade} className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-foreground">{trade}</p>
                                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                    {data.selectedTrades[trade] ?? ''}
                                </p>
                            </div>
                        ))
                    )}
                </SummaryCard>

                {/* Work address */}
                <SummaryCard label="Work address">
                    {!data.workLocation ? (
                        <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                        <>
                            <p className="text-sm text-foreground">{data.workLocation.address}</p>
                            <p className="text-xs text-muted-foreground">
                                {data.workLocation.lat.toFixed(5)}, {data.workLocation.lng.toFixed(5)}
                            </p>
                        </>
                    )}
                </SummaryCard>

                {/* Business details */}
                <SummaryCard label="Business Details">
                    <div className="grid grid-cols-2 gap-1 text-sm">
                        <span className="text-muted-foreground">Years in business</span>
                        <span className="text-foreground">{data.yearsExperience || '—'}</span>
                        <span className="text-muted-foreground">Team size</span>
                        <span className="text-foreground">{data.teamSize || '—'}</span>
                        {data.registrationNumber && (
                            <>
                                <span className="text-muted-foreground">Registration</span>
                                <span className="text-foreground">
                                    {data.registrationNumber}
                                </span>
                            </>
                        )}
                    </div>
                </SummaryCard>
            </div>
        </div>
    );
}

function SummaryCard({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <div className="flex flex-col gap-1.5">{children}</div>
        </div>
    );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen() {
    const router = useRouter();
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-background"
                >
                    <path d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">Application received.</h1>
                <p className="max-w-sm text-base text-muted-foreground">
                    Thank you for applying to join the Scandio contractor network. We&apos;ll
                    review your application and be in touch within 2 business days.
                </p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/pro/join')}>
                Back to Pro page
            </Button>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormData = {
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    selectedTrades: {},
    focusedTrade: null,
    workLocation: null,
    yearsExperience: '',
    teamSize: '',
    registrationNumber: '',
    about: '',
    referral: '',
};

export default function ProOnboardPage() {
    const [step, setStep] = useState(1);
    const [data, setData] = useState<FormData>(EMPTY_FORM);
    const [services, setServices] = useState<Service[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Fetch services when step 3 is first reached
    useEffect(() => {
        if (step !== 3 || services.length > 0) return;
        setServicesLoading(true);
        const supabase = getSupabase();
        supabase
            .from('services')
            .select('id, label')
            .eq('active', true)
            .then(({ data: rows }: { data: Service[] | null }) => {
                setServices(rows ?? []);
                setServicesLoading(false);
            })
            .catch(() => setServicesLoading(false));
    }, [step, services.length]);

    // Scroll content to top on step change
    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [step]);

    function patch(update: Partial<FormData>) {
        setData((prev) => ({ ...prev, ...update }));
    }

    function canContinue(): boolean {
        if (step === 1) return data.businessName.trim().length > 0 && data.contactName.trim().length > 0;
        if (step === 2) return data.email.trim().length > 0 && data.phone.trim().length > 0;
        if (step === 3) return Object.values(data.selectedTrades).some((s) => s.trim().length > 0);
        if (step === 4) return data.workLocation != null;
        if (step === 5) return data.yearsExperience.trim().length > 0 && data.teamSize.trim().length > 0;
        return true;
    }

    async function handleContinue() {
        if (step < TOTAL_STEPS) {
            setStep((s) => s + 1);
        } else {
            // Submit
            setSubmitting(true);
            // TODO: wire up to Supabase insert / API route
            await new Promise((r) => setTimeout(r, 1200));
            setSubmitting(false);
            setSubmitted(true);
        }
    }

    if (submitted) return <SuccessScreen />;

    const stepProps = { data, onChange: patch };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <ProgressBar step={step} />
            <FlowStepHeader step={1} onBack={step > 1 ? () => setStep((s) => s - 1) : null} />

            {/* Scrollable content area — padded to clear fixed header + bottom bar */}
            <div
                ref={contentRef}
                className="flex flex-1 justify-center px-4 pt-24 pb-32 sm:px-6"
            >
                <div className="w-full max-w-xl">
                    {step === 1 && <Step1 {...stepProps} />}
                    {step === 2 && <Step2 {...stepProps} />}
                    {step === 3 && (
                        <Step3
                            {...stepProps}
                            services={services}
                            servicesLoading={servicesLoading}
                        />
                    )}
                    {step === 4 && <Step4 {...stepProps} />}
                    {step === 5 && <Step5 {...stepProps} />}
                    {step === 6 && <Step6 data={data} />}
                </div>
            </div>

            {/* Fixed bottom action bar */}
            <div className="fixed inset-x-0 bottom-0 p-4 z-64">
                <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                    <Button
                        type="button"
                        className="h-10 w-full"
                        disabled={!canContinue() || submitting}
                        onClick={handleContinue}
                    >
                        {submitting
                            ? 'Submitting…'
                            : step === TOTAL_STEPS
                              ? 'Submit Application'
                              : 'Continue'}
                    </Button>
                    {!canContinue() && step === 3 && (
                        <p className="text-center text-xs text-muted-foreground">
                            Select Service to Continue
                        </p>
                    )}
                    {!canContinue() && step === 4 && (
                        <p className="text-center text-xs text-muted-foreground">
                            Enter Address to Continue
                        </p>
                    )}
                    {!canContinue() && step === 5 && (
                        <p className="text-center text-xs text-muted-foreground">
                            Enter years in business and team size (both required) to continue.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
