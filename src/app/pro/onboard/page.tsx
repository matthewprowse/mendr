'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
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
type ServiceArea = {
    id: string;
    location: MatchLocation;
    radiusKm: number;
};

const TOTAL_STEPS = 6;

// ─── Form data ────────────────────────────────────────────────────────────────

type FormData = {
    businessName: string;
    contactName: string;
    address: string;
    phoneCountryCode: string;
    phone: string;
    website: string;
    trade: string;
    tradeDescription: string;
    serviceAreas: ServiceArea[];
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
                    Let&apos;s get started.
                </h1>
                <p className="text-sm text-muted-foreground">
                    Tell us about your business and the person we&apos;ll be in touch with.
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
    const [addressInput, setAddressInput] = useState(data.address ?? '');
    const [isFormattingAddress, setIsFormattingAddress] = useState(false);

    const PHONE_PREFIX = '+27';

    // Formats SA numbers into `81 595 6488` (without the +27 prefix).
    function formatSaPhoneNationalDigits(raw: string): string {
        const digitsOnly = raw.replace(/\D/g, '');
        let digits = digitsOnly;

        // Strip a user-typed country code, if present.
        if (digits.startsWith('27')) digits = digits.slice(2);

        // Strip a user-typed national leading `0` (common in SA mobile inputs).
        if (digits.startsWith('0')) digits = digits.slice(1);

        if (!digits) return '';

        // Basic SA mobile formatting: `XX XXX XXXX` (9 digits)
        // Example: 815956488 -> 81 595 6488
        if (digits.length <= 2) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;

        const a = digits.slice(0, 2);
        const b = digits.slice(2, 5);
        const c = digits.slice(5, 9);
        const rest = digits.length > 9 ? digits.slice(9) : '';

        return `${a} ${b} ${c}${rest ? ` ${rest}` : ''}`.trim();
    }

    function normalizeWebsiteToHttpsUrl(raw: string): string {
        const trimmed = raw.trim();
        if (!trimmed) return '';
        const noProto = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
        return `https://${noProto}`;
    }

    const [websiteRemainderInputValue, setWebsiteRemainderInputValue] = useState(() => {
        const raw = (data.website ?? '').trim();
        return raw.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
    });

    useEffect(() => {
        setAddressInput(data.address ?? '');
    }, [data.address]);

    useEffect(() => {
        const raw = (data.website ?? '').trim();
        setWebsiteRemainderInputValue(raw.replace(/^https?:\/\//i, '').replace(/\/+$/g, ''));
    }, [data.website]);

    const resolveAddress = useCallback(async () => {
        const trimmed = addressInput.trim();
        if (!trimmed) return;

        setIsFormattingAddress(true);
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

            if (!geo?.address || typeof geo.address !== 'string') {
                toast.error(geo?.error || 'Failed to format address');
                return;
            }

            onChange({ address: geo.address });
            setAddressInput(geo.address);
        } finally {
            setIsFormattingAddress(false);
        }
    }, [addressInput, onChange]);

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Contact Details
                </h1>
                <p className="text-sm text-muted-foreground">
                    Your business address, phone number, and website so homeowners can reach you.
                </p>
            </div>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <Label htmlFor="onboard-address">Address</Label>
                    <Input
                        id="onboard-address"
                        className="h-10 w-full text-sm"
                        value={addressInput}
                        onChange={(e) => {
                            setAddressInput(e.target.value);
                            onChange({ address: e.target.value });
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            void resolveAddress();
                        }}
                        disabled={isFormattingAddress}
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        Press Enter to format the address with Google.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-9 w-full text-sm"
                        placeholder={`${PHONE_PREFIX} 81 595 6488`}
                        value={data.phone ? `${PHONE_PREFIX} ${data.phone}` : `${PHONE_PREFIX} `}
                        onChange={(e) => {
                            const nationalFormatted = formatSaPhoneNationalDigits(
                                e.target.value,
                            );
                            onChange({
                                phoneCountryCode: PHONE_PREFIX,
                                phone: nationalFormatted,
                            });
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        We&apos;ll show the full number in the summary.
                    </p>
                </div>
                <div className="flex flex-col gap-3">
                    <Label htmlFor="website">
                        Website
                    </Label>
                    <div>
                        <Input
                            id="website"
                            type="text"
                            className="h-9 w-full text-sm"
                            value={websiteRemainderInputValue}
                            onChange={(e) => {
                                const remainder = e.target.value
                                    .trim()
                                    .replace(/^https?:\/\//i, '')
                                    .replace(/\/+$/g, '');
                                setWebsiteRemainderInputValue(remainder);
                                onChange({
                                    website: remainder
                                        ? normalizeWebsiteToHttpsUrl(remainder)
                                        : '',
                                });
                            }}
                            placeholder="example.com"
                        />
                    </div>
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
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    What&apos;s your trade?
                </h1>
                <p className="text-sm text-muted-foreground">
                    Select your primary service and describe the specific work you specialise in.
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="main-trade-select">Service</Label>
                {servicesLoading ? (
                    <div className="h-10 w-full animate-pulse rounded-md border border-border/50 bg-muted/40" />
                ) : (
                    <Select
                        value={data.trade || undefined}
                        onValueChange={(label) => onChange({ trade: label })}
                        disabled={services.length === 0}
                    >
                        <SelectTrigger
                            id="main-trade-select"
                            className="w-full min-h-10 text-sm"
                        >
                            <SelectValue placeholder="Select Service" />
                        </SelectTrigger>
                        <SelectContent>
                            {services.map(({ id, label }) => (
                                <SelectItem key={id} value={label} className="min-h-9">
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <Label htmlFor="trade-description-input">Description</Label>
                <Textarea
                    id="trade-description-input"
                    value={data.tradeDescription}
                    onChange={(e) => onChange({ tradeDescription: e.target.value })}
                    rows={3}
                    className="text-sm"
                    disabled={!data.trade}
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
    const [radiusKmInput, setRadiusKmInput] = useState(5);
    const [isResolving, setIsResolving] = useState(false);
    const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
    const serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : [];

    const activeArea =
        serviceAreas.find((area) => area.id === activeAreaId) ??
        serviceAreas[serviceAreas.length - 1] ??
        null;
    const mapAreas = useMemo(
        () =>
            serviceAreas.map((area) => ({
                location: area.location,
                radiusMeters: Math.round(area.radiusKm * 1000),
            })),
        [serviceAreas],
    );

    const { mapHostRef } = useMatchMap({
        userLocation: activeArea?.location ?? null,
        providers: [],
        searchRadiusMeters: Math.round((activeArea?.radiusKm ?? 0) * 1000),
        showSearchRadius: !mapAreas.length && Boolean(activeArea),
        showUserPin: true,
        userAreas: mapAreas,
    });

    const addServiceArea = useCallback(async () => {
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
            const area: ServiceArea = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                location: loc,
                radiusKm: radiusKmInput,
            };
            onChange({ serviceAreas: [...serviceAreas, area] });
            setActiveAreaId(area.id);
            setAddressInput(loc.address);
            toast.success('Service area added');
        } finally {
            setIsResolving(false);
        }
    }, [addressInput, onChange, radiusKmInput, serviceAreas]);

    function updateAreaRadius(areaId: string, nextRadiusKm: number) {
        onChange({
            serviceAreas: serviceAreas.map((area) =>
                area.id === areaId ? { ...area, radiusKm: nextRadiusKm } : area,
            ),
        });
    }

    function removeArea(areaId: string) {
        const next = serviceAreas.filter((area) => area.id !== areaId);
        onChange({ serviceAreas: next });
        if (activeAreaId === areaId) {
            setActiveAreaId(next[next.length - 1]?.id ?? null);
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                    Where do you work?
                </h1>
                <p className="text-sm text-muted-foreground">
                    Address search is limited to Western Cape, South Africa. Press Enter to look up
                    and add a service radius.
                </p>
            </div>

            <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
                <div className="flex flex-col gap-3">
                    <Label htmlFor="onboard-work-address">Service area address</Label>
                    <Input
                        id="onboard-work-address"
                        className="h-10 text-sm"
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            void addServiceArea();
                        }}
                        disabled={isResolving}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="onboard-radius">Radius</Label>
                        <span className="text-xs text-muted-foreground">{radiusKmInput} km</span>
                    </div>
                    <Slider
                        value={[radiusKmInput]}
                        onValueChange={(vals) => setRadiusKmInput(vals[0] ?? radiusKmInput)}
                        min={1}
                        max={50}
                        step={1}
                        id="onboard-radius"
                    />
                </div>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void addServiceArea()}
                    disabled={isResolving || addressInput.trim().length === 0}
                >
                    {isResolving ? 'Adding area...' : 'Add service area'}
                </Button>
            </div>

            {serviceAreas.length > 0 ? (
                <div className="flex flex-col gap-3">
                    <Label>Saved service areas</Label>
                    {serviceAreas.map((area) => (
                        <div
                            key={area.id}
                            className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
                        >
                            <button
                                type="button"
                                className="text-left"
                                onClick={() => setActiveAreaId(area.id)}
                            >
                                <p className="text-sm text-foreground">{area.location.address}</p>
                                <p className="text-xs text-muted-foreground">
                                    {area.location.lat.toFixed(5)}, {area.location.lng.toFixed(5)}
                                </p>
                            </button>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Radius</span>
                                    <span className="text-xs text-muted-foreground">
                                        {area.radiusKm} km
                                    </span>
                                </div>
                                <Slider
                                    value={[area.radiusKm]}
                                    onValueChange={(vals) =>
                                        updateAreaRadius(area.id, vals[0] ?? area.radiusKm)}
                                    min={1}
                                    max={50}
                                    step={1}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                className="self-start text-xs"
                                onClick={() => removeArea(area.id)}
                            >
                                Remove area
                            </Button>
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="relative flex min-h-[220px] w-full overflow-hidden rounded-lg bg-secondary sm:min-h-[280px]">
                <div ref={mapHostRef} className="absolute inset-0 w-full h-full rounded-lg" />
                {!activeArea || isResolving ? (
                    <p className="relative z-10 m-auto max-w-[90%] text-center text-xs text-muted-foreground">
                        {isResolving
                            ? 'Searching'
                            : 'Add at least one service area to preview it on the map.'}
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
    const serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : [];

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
                    <p className="text-sm text-foreground">{data.address || '—'}</p>
                    <p className="text-sm text-muted-foreground">
                        {data.phone
                            ? `+27 ${data.phone}`.trim()
                            : '—'}
                    </p>
                    {data.website && (
                        <p className="text-sm text-muted-foreground">{data.website}</p>
                    )}
                </SummaryCard>

                {/* Trade */}
                <SummaryCard label="Trade">
                    <p className="text-sm font-medium text-foreground">{data.trade || '—'}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {data.tradeDescription || '—'}
                    </p>
                </SummaryCard>

                {/* Service areas */}
                <SummaryCard label="Service areas">
                    {serviceAreas.length === 0 ? (
                        <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                        serviceAreas.map((area) => (
                            <div key={area.id} className="flex flex-col gap-1">
                                <p className="text-sm text-foreground">
                                    {area.location.address} ({area.radiusKm} km)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {area.location.lat.toFixed(5)}, {area.location.lng.toFixed(5)}
                                </p>
                            </div>
                        ))
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
    address: '',
    phoneCountryCode: '+27',
    phone: '',
    website: '',
    trade: '',
    tradeDescription: '',
    serviceAreas: [],
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
        const serviceAreas = Array.isArray(data.serviceAreas) ? data.serviceAreas : [];
        if (step === 1) return data.businessName.trim().length > 0 && data.contactName.trim().length > 0;
        if (step === 2) return data.address.trim().length > 0 && data.phone.trim().length > 0;
        if (step === 3) return data.trade.trim().length > 0 && data.tradeDescription.trim().length > 0;
        if (step === 4) return serviceAreas.length > 0;
        if (step === 5) return data.yearsExperience.trim().length > 0 && data.teamSize.trim().length > 0;
        return true;
    }

    async function handleContinue() {
        if (step < TOTAL_STEPS) {
            setStep((s) => s + 1);
        } else {
            setSubmitting(true);
            try {
                const res = await fetch('/api/providers/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                if (!res.ok) {
                    const json = await res.json().catch(() => null);
                    toast.error(
                        (json as { error?: string } | null)?.error ??
                            'Something went wrong. Please try again.'
                    );
                    return;
                }
                setSubmitted(true);
            } catch {
                toast.error('Could not submit your application. Check your connection and try again.');
            } finally {
                setSubmitting(false);
            }
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
            <div className="fixed inset-x-0 bottom-0 z-64 bg-background p-4">
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
                            Add at least one service area to continue
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
