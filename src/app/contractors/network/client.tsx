'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { importLibrary } from '@googlemaps/js-api-loader';
import { ensureGoogleMapsLoaderOptions } from '@/lib/google-maps-js-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FlowStepHeader } from '@/components/flow-header';
import { Separator } from '@/components/ui/separator';
import { getSupabase } from '@/lib/auth/supabase';
import { geocodeApi } from '@/features/match/api/client';
import { createClientId } from '@/lib/client-random-id';
import { formatSaRegistrationInput, isValidSaRegistrationNumber, registrationNumberPlaceholder } from './sa-registration';

type Service = { id: string; label: string };
type UploadedImage = { id: string; path: string; bucket: string; caption: string | null; previewUrl?: string };
type RegistrationCertificate = { id: string; path: string; bucket: string; fileName: string; previewUrl?: string };
type GalleryDraftItem = { id: string; file: File; caption: string; preview: string };

const REGISTRATION_CERT_CAPTION = 'Registration certificate';
const KYC_ID_CAPTION = 'KYC: ID document';
const KYC_SELFIE_CAPTION = 'KYC: Selfie photo';
function certificationCaption(label: string): string {
    return `Certification: ${label.trim()}`;
}

const SESSION_KEY = 'scandio-contractor-onboard-v2';

const STEP = {
    CONTRACTOR_TYPE: 1,
    WILLINGNESS_TO_PAY: 2,
    COMPANY_SEARCH: 3,
    BASICS: 4,
    CONTACT: 5,
    SERVICE: 6,
    TRADE: 7,
    PROFILE: 8,
    KYC: 9,
    GALLERY: 10,
    CONFIRM: 11,
} as const;

const TOTAL_STEPS = STEP.CONFIRM;
const DEFAULT_SERVICE_RADIUS_KM = 10;

type ContractorType = 'individual' | 'team' | 'enterprise';

type ServiceRadius = { id: string; address: string; lat: number; lng: number; radiusKm: number };
type CertificationFile = { id: string; path: string; bucket: string; label: string; previewUrl?: string };
type KycFile = { path: string; bucket: string; fileName: string; previewUrl?: string };

type ExistingApplicationRow = {
    id: string;
    contractor_type?: string | null;
    willingness_to_pay_band?: string | null;
    applicant_google_place_id?: string | null;
    kyc_documents?: { idDocument?: { path: string; bucket: string }; selfie?: { path: string; bucket: string } } | null;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    address: string | null;
    phone: string | null;
    whatsapp_available: boolean | null;
    website: string | null;
    trade: string | null;
    trade_description: string | null;
    founded_year: number | null;
    team_size: number | null;
    registration_number: string | null;
    certifications: string | null;
    highlights: string | null;
    referral: string | null;
    about?: string | null;
    application_images: Array<{ path: string; bucket: string; caption?: string | null }> | null;
    service_areas: Array<{ address?: string; lat?: number; lng?: number; radius_km?: number }> | null;
};
/** Space between the last field and the fixed footer (visual gap above the bar). */
const FOOTER_SCROLL_GAP_PX = 24;
/** Minimum bottom clearance when footer height is not measured yet (tall phones + safe area). */
const FOOTER_SCROLL_MIN_PX = 160;
type FormData = {
    contractorType: ContractorType | '';
    willingnessToPayBand: string;
    applicantGooglePlaceId: string;
    businessName: string;
    contactPerson: string;
    emailAddress: string;
    address: string;
    phone: string;
    whatsappAvailable: boolean;
    website: string;
    trade: string;
    specialisations: string;
    foundedYear: string;
    teamSize: string;
    registrationNumber: string;
    bio: string;
    certifications: string;
    highlights: string;
    referralSource: string;
    referralOther: string;
};

const EMPTY_FORM: FormData = {
    contractorType: '',
    willingnessToPayBand: '',
    applicantGooglePlaceId: '',
    businessName: '',
    contactPerson: '',
    emailAddress: '',
    address: '',
    phone: '',
    whatsappAvailable: false,
    website: '',
    trade: '',
    specialisations: '',
    foundedYear: '',
    teamSize: '',
    registrationNumber: '',
    bio: '',
    certifications: '',
    highlights: '',
    referralSource: '',
    referralOther: '',
};

function maxServiceRadiiForType(t: ContractorType | ''): number {
    if (t === 'individual') return 1;
    if (t === 'team') return 3;
    if (t === 'enterprise') return 6;
    return 1;
}

const WILLINGNESS_OPTIONS = [
    { value: 'under_200', label: 'Under R200 / month' },
    { value: '200_350', label: 'R200 – R350 / month' },
    { value: '350_700', label: 'R350 – R700 / month' },
    { value: '700_plus', label: 'R700+ / month' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

function toTitleCaseWords(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function normalizeToken(value: string): string {
    return toTitleCaseWords(value.replace(/\s+/g, ' ').trim());
}

function tokenizeCsv(value: string): string[] {
    return value.split(',').map((x) => normalizeToken(x)).filter(Boolean);
}

function normalizeWebsiteToHttps(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const noProto = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
    return `https://${noProto}`;
}

function toSaE164(value: string): string | null {
    const digitsOnly = value.replace(/\D/g, '');
    let digits = digitsOnly;
    if (digits.startsWith('27')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^(\d{9})$/.test(digits)) return null;
    return `+27${digits}`;
}

function formatSaPhoneDisplay(value: string): string {
    const e164 = toSaE164(value);
    if (!e164) return value.replace(/[^\d+\s]/g, '').slice(0, 16);
    const n = e164.slice(3);
    return `+27 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 9)}`;
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function RequiredLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <Label htmlFor={htmlFor}>{children}</Label>
            <Badge variant="secondary">Required</Badge>
        </div>
    );
}

function OptionalLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <Label htmlFor={htmlFor}>{children}</Label>
            <Badge variant="secondary">Optional</Badge>
        </div>
    );
}

function StepHeader({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    );
}

/** Matches search-radius styling on `/match` (`useMatchMap`). */
function ServiceRadiusMap({
    radii,
    selectedId: _selectedId,
    onSelect: _onSelect,
}: {
    radii: ServiceRadius[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const overlaysRef = useRef<google.maps.Circle[]>([]);

    useEffect(() => {
        if (!apiKey || !containerRef.current) return;
        ensureGoogleMapsLoaderOptions(apiKey);
        importLibrary('maps')
            .then(() => {
                if (!containerRef.current) return;
                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: -33.9249, lng: 18.4241 },
                    zoom: 12,
                    disableDefaultUI: true,
                    clickableIcons: false,
                    mapId: 'scandio-match-map',
                });
                mapRef.current = map;
            })
            .catch(() => {
                mapRef.current = null;
            });
    }, [apiKey]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        overlaysRef.current.forEach((overlay) => overlay.setMap(null));
        overlaysRef.current = [];
        if (radii.length === 0) return;

        const bounds = new google.maps.LatLngBounds();

        radii.forEach((r) => {
            const center = { lat: r.lat, lng: r.lng };
            const circle = new google.maps.Circle({
                map,
                center,
                radius: r.radiusKm * 1000,
                strokeColor: '#4f46e5',
                strokeOpacity: 0.45,
                strokeWeight: 1.5,
                fillColor: '#4f46e5',
                fillOpacity: 0.08,
                clickable: false,
            });
            overlaysRef.current.push(circle);

            const circleBounds = circle.getBounds();
            if (circleBounds) bounds.union(circleBounds);
        });

        try {
            map.fitBounds(bounds, 48);
        } catch {
            /* ignore */
        }
    }, [radii]);

    if (!apiKey) {
        return (
            <div className="relative flex h-52 w-full items-center justify-center overflow-hidden rounded-lg bg-secondary text-sm text-muted-foreground">
                Map unavailable (no API key)
            </div>
        );
    }

    return (
        <div className="relative h-52 w-full overflow-hidden rounded-lg bg-secondary">
            <div ref={containerRef} className="absolute inset-0 h-full w-full rounded-lg" />
        </div>
    );
}

function StepContractorType({ data, onChange }: { data: FormData; onChange: (patch: Partial<FormData>) => void }) {
    const setType = (t: ContractorType) => onChange({ contractorType: t });
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="How do you work?"
                description="We use this to set how many service areas you can add and to understand our network."
            />
            <div className="flex flex-col gap-3">
                {(
                    [
                        { v: 'individual' as const, label: 'Individual', sub: 'Solo operator — one primary service radius.' },
                        { v: 'team' as const, label: 'Team', sub: 'Small crew — up to three coverage zones.' },
                        { v: 'enterprise' as const, label: 'Enterprise', sub: 'Larger business — up to six coverage zones.' },
                    ] as const
                ).map((opt) => (
                    <button
                        key={opt.v}
                        type="button"
                        onClick={() => setType(opt.v)}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                            data.contractorType === opt.v ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                        }`}
                    >
                        <span className="font-medium text-foreground">{opt.label}</span>
                        <span className="text-sm text-muted-foreground">{opt.sub}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function StepWillingnessToPay({ data, onChange }: { data: FormData; onChange: (patch: Partial<FormData>) => void }) {
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="What would you pay per month?"
                description="Roughly what is fair for platform access and informed leads in your area? This helps us prioritise value — it is not a bill or contract."
            />
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor="wtp">Comfortable monthly range</RequiredLabel>
                <Select value={data.willingnessToPayBand} onValueChange={(v) => onChange({ willingnessToPayBand: v })}>
                    <SelectTrigger id="wtp" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                        <SelectValue placeholder="Choose a range" />
                    </SelectTrigger>
                    <SelectContent>
                        {WILLINGNESS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Founding providers often lock in better rates before standard pricing applies.</p>
            </div>
        </div>
    );
}

type PlaceSearchHit = { placeId: string; name: string; address: string; rating: number | null; userRatingCount: number | null };

type PlaceDetailsPayload = {
    placeId: string;
    businessName: string;
    address: string;
    phone: string | null;
    website: string | null;
    lat: number | null;
    lng: number | null;
};

function StepCompanySearch({
    onPrefill,
    onSkip,
    selectedPlaceId,
}: {
    onPrefill: (details: PlaceDetailsPayload) => void;
    onSkip: () => void;
    selectedPlaceId: string;
}) {
    const [q, setQ] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<PlaceSearchHit[]>([]);
    const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

    async function runSearch() {
        const t = q.trim();
        if (t.length < 2) {
            toast.error('Type at least 2 characters.');
            return;
        }
        setSearching(true);
        try {
            const res = await fetch('/api/providers/onboarding/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: t }),
            });
            const json = (await res.json().catch(() => null)) as { results?: PlaceSearchHit[]; error?: string } | null;
            if (!res.ok) {
                toast.error(json?.error ?? 'Search failed.');
                setResults([]);
                return;
            }
            setResults(json?.results ?? []);
        } finally {
            setSearching(false);
        }
    }

    async function pickPlace(placeId: string) {
        setLoadingDetails(placeId);
        try {
            const res = await fetch('/api/providers/onboarding/place-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ placeId }),
            });
            const json = (await res.json().catch(() => null)) as { details?: PlaceDetailsPayload; error?: string } | null;
            if (!res.ok || !json?.details) {
                toast.error(json?.error ?? 'Could not load that business.');
                return;
            }
            onPrefill(json.details);
            toast.success('Details loaded — you can edit them on the next screens.');
        } finally {
            setLoadingDetails(null);
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Find your business"
                description="Search public listings to pre-fill your profile. Everything can be edited — or skip if you are not on Maps."
            />
            <div className="flex flex-col gap-3">
                <Label htmlFor="bizSearch">Business or trading name</Label>
                <div className="flex gap-2">
                    <Input
                        id="bizSearch"
                        className="h-10 flex-1 text-sm"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch();
                            }
                        }}
                        placeholder="e.g. Smith Painters Bellville"
                    />
                    <Button type="button" variant="secondary" className="h-10 shrink-0 px-4" disabled={searching} onClick={() => void runSearch()}>
                        {searching ? '…' : 'Search'}
                    </Button>
                </div>
            </div>
            {results.length > 0 ? (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
                    {results.map((r) => (
                        <li key={r.placeId}>
                            <button
                                type="button"
                                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                                disabled={loadingDetails !== null}
                                onClick={() => void pickPlace(r.placeId)}
                            >
                                <span className="font-medium text-foreground">{r.name}</span>
                                <span className="text-xs text-muted-foreground">{r.address}</span>
                                {r.rating != null ? (
                                    <span className="text-xs text-muted-foreground">
                                        {r.rating.toFixed(1)} ★{r.userRatingCount != null ? ` (${r.userRatingCount})` : ''}
                                    </span>
                                ) : null}
                                {loadingDetails === r.placeId ? <span className="text-xs text-primary">Loading…</span> : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
            <Button type="button" variant="outline" className="h-10 w-full" onClick={onSkip}>
                My business is not listed — enter manually
            </Button>
            {selectedPlaceId ? (
                <p className="text-xs text-muted-foreground">Selected Maps listing saved. You can change it by searching again.</p>
            ) : null}
        </div>
    );
}

function StepBasics({ data, onChange }: { data: FormData; onChange: (patch: Partial<FormData>) => void }) {
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Business identity"
                description="How you want to appear to homeowners. If you pulled data from search, check it carefully."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="businessName">Business or trading name</RequiredLabel>
                    <Input
                        id="businessName"
                        className="h-10 text-sm"
                        value={data.businessName}
                        onChange={(e) => onChange({ businessName: e.target.value })}
                        onBlur={(e) => onChange({ businessName: toTitleCaseWords(e.target.value) })}
                        maxLength={90}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="contactPerson">Your full name</RequiredLabel>
                    <Input
                        id="contactPerson"
                        className="h-10 text-sm"
                        value={data.contactPerson}
                        onChange={(e) => onChange({ contactPerson: e.target.value })}
                        onBlur={(e) => onChange({ contactPerson: toTitleCaseWords(e.target.value) })}
                        maxLength={90}
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="emailAddress">Email</RequiredLabel>
                    <Input
                        id="emailAddress"
                        type="email"
                        className="h-10 text-sm"
                        value={data.emailAddress}
                        onChange={(e) => onChange({ emailAddress: e.target.value })}
                        placeholder="name@email.com"
                        autoComplete="email"
                    />
                </div>
            </div>
        </div>
    );
}

function Step2({
    data,
    onChange,
    onEnsureAddress,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
    onEnsureAddress: () => Promise<boolean>;
}) {
    const websiteDisplay = useMemo(
        () => (data.website || '').replace(/^https?:\/\//i, '').replace(/\/+$/g, ''),
        [data.website]
    );

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Contact details"
                description="Business address and the best number for homeowner enquiries. We use the Western Cape for address checks during founding launch."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="address">Business address</RequiredLabel>
                    <Input
                        id="address"
                        className="h-10 text-sm"
                        value={data.address}
                        onChange={(e) => onChange({ address: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void onEnsureAddress();
                            }
                        }}
                    />
                    <p className="text-xs text-muted-foreground">Street and suburb — we normalise this against the map.</p>
                </div>

                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="phone">Phone</RequiredLabel>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-10 text-sm"
                        value={data.phone}
                        onChange={(e) => onChange({ phone: formatSaPhoneDisplay(e.target.value) })}
                        placeholder="+27 00 000 0000"
                    />
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Checkbox id="whatsapp" checked={data.whatsappAvailable} onCheckedChange={(checked) => onChange({ whatsappAvailable: Boolean(checked) })} />
                        <label htmlFor="whatsapp" className="text-sm leading-relaxed text-foreground">
                            This number is on WhatsApp — you are happy to receive leads there.
                        </label>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="website">Website</OptionalLabel>
                    <Input
                        id="website"
                        className="h-10 text-sm"
                        value={websiteDisplay}
                        onChange={(e) => {
                            const remainder = e.target.value.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
                            onChange({ website: remainder ? normalizeWebsiteToHttps(remainder) : '' });
                        }}
                        placeholder="example.com"
                    />
                </div>
            </div>
        </div>
    );
}

function ServiceRadiusRowEditor({
    row,
    onPatch,
    onRemove,
    showRemove,
}: {
    row: ServiceRadius;
    onPatch: (id: string, patch: Partial<ServiceRadius>) => void;
    onRemove: (id: string) => void;
    showRemove: boolean;
}) {
    useEffect(() => {
        const addr = row.address.trim();
        const km = Number(row.radiusKm);
        if (!addr || !Number.isFinite(km) || km < 1 || km > 100) {
            if (row.lat !== 0 || row.lng !== 0) onPatch(row.id, { lat: 0, lng: 0 });
            return;
        }
        const handle = window.setTimeout(() => {
            void geocodeApi({ address: addr, westernCapeOnly: true }).then((geo) => {
                if (!geo?.address || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
                    onPatch(row.id, { lat: 0, lng: 0 });
                    return;
                }
                const rounded = Math.min(100, Math.max(1, Math.round(km)));
                onPatch(row.id, { lat: geo.lat, lng: geo.lng, address: geo.address, radiusKm: rounded });
            });
        }, 450);
        return () => window.clearTimeout(handle);
    }, [row.address, row.radiusKm, row.id, onPatch]);

    return (
        <div className="flex flex-col gap-4 rounded-lg border border-border/75 p-4">
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor={`svc-addr-${row.id}`}>Centre address for this zone</RequiredLabel>
                <Input
                    id={`svc-addr-${row.id}`}
                    className="h-10 text-sm"
                    value={row.address}
                    onChange={(e) => onPatch(row.id, { address: e.target.value })}
                    onBlur={(e) => onPatch(row.id, { address: toTitleCaseWords(e.target.value) })}
                    placeholder="Street, suburb, city"
                />
            </div>
            <div className="flex flex-col gap-4">
                <RequiredLabel htmlFor={`svc-km-${row.id}`}>Radius (km)</RequiredLabel>
                <Input
                    id={`svc-km-${row.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    className="h-10 text-sm"
                    value={String(row.radiusKm)}
                    onChange={(e) => onPatch(row.id, { radiusKm: Math.min(100, Math.max(1, Number(e.target.value.replace(/[^\d.]/g, '')) || 1)) })}
                />
            </div>
            {row.lat !== 0 && row.lng !== 0 ? (
                <p className="text-xs text-muted-foreground">Mapped — {row.radiusKm} km from {row.address}</p>
            ) : (
                <p className="text-xs text-muted-foreground">Enter a Western Cape address we can place on the map.</p>
            )}
            {showRemove ? (
                <Button type="button" variant="ghost" className="h-9 w-full" onClick={() => onRemove(row.id)}>
                    Remove this zone
                </Button>
            ) : null}
        </div>
    );
}

function StepServiceAreas({
    maxRadii,
    radii,
    onRadiiChange,
    patchRadiusRow,
}: {
    maxRadii: number;
    radii: ServiceRadius[];
    onRadiiChange: (next: ServiceRadius[]) => void;
    patchRadiusRow: (id: string, patch: Partial<ServiceRadius>) => void;
}) {
    const handleMapSelect = useCallback(() => {}, []);
    const selectedId = radii[0]?.id ?? null;

    const addZone = () => {
        if (radii.length >= maxRadii) return;
        onRadiiChange([
            ...radii,
            { id: createClientId(), address: '', lat: 0, lng: 0, radiusKm: DEFAULT_SERVICE_RADIUS_KM },
        ]);
    };

    const removeZone = (id: string) => {
        if (radii.length <= 1) return;
        onRadiiChange(radii.filter((r) => r.id !== id));
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Where you work"
                description={
                    maxRadii === 1
                        ? 'Set the centre of your operating area and how far you travel for jobs.'
                        : `Add up to ${maxRadii} zones (e.g. different suburbs or crews). Each needs a centre address and radius.`
                }
            />
            <div className="w-full max-w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                <ServiceRadiusMap radii={radii.filter((r) => r.lat !== 0 && r.lng !== 0)} selectedId={selectedId} onSelect={handleMapSelect} />
                <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                    {radii.some((r) => r.lat !== 0 && r.lng !== 0)
                        ? radii
                              .filter((r) => r.lat !== 0 && r.lng !== 0)
                              .map((r) => (
                                  <span key={r.id}>
                                      {r.address} — {r.radiusKm} km
                                  </span>
                              ))
                        : 'Enter valid addresses to preview coverage.'}
                </div>
            </div>
            <div className="flex flex-col gap-6">
                {radii.map((row) => (
                    <ServiceRadiusRowEditor
                        key={row.id}
                        row={row}
                        onPatch={patchRadiusRow}
                        onRemove={removeZone}
                        showRemove={maxRadii > 1 && radii.length > 1}
                    />
                ))}
                {maxRadii > 1 && radii.length < maxRadii ? (
                    <Button type="button" variant="secondary" className="h-10 w-full" onClick={addZone}>
                        Add another zone ({radii.length} of {maxRadii})
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function Step4({
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
    const specialisationChips = useMemo(() => tokenizeCsv(data.specialisations), [data.specialisations]);
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Trade and specialisations"
                description="What you do day-to-day — we use this to match you to the right homeowner jobs."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="trade">Primary service</RequiredLabel>
                    {servicesLoading ? (
                        <div className="h-10 w-full animate-pulse rounded-md border border-border/50 bg-muted/40" />
                    ) : (
                        <Select value={data.trade} onValueChange={(v) => onChange({ trade: v })} disabled={services.length === 0}>
                            <SelectTrigger id="trade" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                                <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                                {services.map((service) => (
                                    <SelectItem key={service.id} value={service.label}>
                                        {service.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="specialisations">Specialisations</RequiredLabel>
                    <Textarea
                        id="specialisations"
                        className="h-24 text-sm"
                        value={data.specialisations}
                        onChange={(e) => onChange({ specialisations: e.target.value })}
                        placeholder="Comma-separated, e.g. interior walls, roof coating, waterproofing"
                    />
                    <p className="text-xs text-muted-foreground">Separate with commas — we turn them into tags on your profile.</p>
                    <div className="flex flex-wrap gap-2">
                        {specialisationChips.map((chip, index) => (
                            <Badge key={`${chip}-${index}`} variant="secondary">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Step5({
    data,
    onChange,
    registrationCertificate,
    onRegistrationCertificateChange,
    certificationFiles,
    onCertificationFilesChange,
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
    registrationCertificate: RegistrationCertificate | null;
    onRegistrationCertificateChange: (next: RegistrationCertificate | null) => void;
    certificationFiles: CertificationFile[];
    onCertificationFilesChange: (next: CertificationFile[]) => void;
}) {
    const certificationChips = useMemo(() => tokenizeCsv(data.certifications), [data.certifications]);
    const regValid = isValidSaRegistrationNumber(data.registrationNumber);
    const regTouched = data.registrationNumber.trim().length > 0;
    const [regCertBusy, setRegCertBusy] = useState(false);
    const [certLabelDraft, setCertLabelDraft] = useState('');
    const [certFileBusy, setCertFileBusy] = useState(false);

    const regFileInputRef = useRef<HTMLInputElement>(null);
    const certFileInputRef = useRef<HTMLInputElement>(null);

    const handleRegistrationCertFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;
        setRegCertBusy(true);
        try {
            const fd = new FormData();
            fd.set('file', file);
            const res = await fetch('/api/providers/application-registration-cert', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as { path?: string; bucket?: string; fileName?: string; error?: string } | null;
            if (!res.ok || !json?.path || !json.bucket) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const previewUrl =
                file.type.startsWith('image/') && typeof file.type === 'string'
                    ? URL.createObjectURL(file)
                    : undefined;
            onRegistrationCertificateChange({
                id: createClientId(),
                path: json.path,
                bucket: json.bucket,
                fileName: json.fileName || file.name || 'certificate',
                previewUrl,
            });
            toast.success('Certificate uploaded.');
        } catch {
            toast.error('Could not upload the file.');
        } finally {
            setRegCertBusy(false);
        }
    };

    const handleCertificationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;
        const label = certLabelDraft.trim();
        if (!label) {
            toast.error('Add a label for this certificate (e.g. trade test or safety course).');
            return;
        }
        setCertFileBusy(true);
        try {
            const fd = new FormData();
            fd.set('kind', 'certification');
            fd.set('file', file);
            const res = await fetch('/api/providers/application-document', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as { path?: string; bucket?: string; fileName?: string; error?: string } | null;
            if (!res.ok || !json?.path || !json.bucket) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const previewUrl =
                file.type.startsWith('image/') && typeof file.type === 'string'
                    ? URL.createObjectURL(file)
                    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${json.bucket}/${json.path}`;
            onCertificationFilesChange([
                ...certificationFiles,
                {
                    id: createClientId(),
                    path: json.path,
                    bucket: json.bucket,
                    label,
                    previewUrl,
                },
            ]);
            setCertLabelDraft('');
            toast.success('Certification attached.');
        } catch {
            toast.error('Could not upload the file.');
        } finally {
            setCertFileBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Business profile"
                description="Credentials and story homeowners see when we introduce you. CIPC details are optional unless you enter a company registration number."
            />
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="foundedYear">Year founded</RequiredLabel>
                        <Input id="foundedYear" type="number" inputMode="numeric" min="1900" max="2100" className="h-10" value={data.foundedYear} onChange={(e) => onChange({ foundedYear: e.target.value.replace(/[^\d]/g, '') })} />
                    </div>
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="teamSize">Team size</RequiredLabel>
                        <Input id="teamSize" type="number" inputMode="numeric" min="1" className="h-10" value={data.teamSize} onChange={(e) => onChange({ teamSize: e.target.value.replace(/[^\d]/g, '') })} />
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="registrationNumber">CIPC registration number</OptionalLabel>
                    <Input
                        id="registrationNumber"
                        className="h-10"
                        value={data.registrationNumber}
                        onChange={(e) => {
                            const next = formatSaRegistrationInput(e.target.value);
                            onChange({ registrationNumber: next });
                            if (!isValidSaRegistrationNumber(next)) {
                                if (registrationCertificate?.previewUrl?.startsWith('blob:')) {
                                    URL.revokeObjectURL(registrationCertificate.previewUrl);
                                }
                                onRegistrationCertificateChange(null);
                            }
                        }}
                        placeholder={registrationNumberPlaceholder()}
                        autoComplete="off"
                    />
                    {regTouched && !regValid ? (
                        <p className="text-xs text-destructive">Enter Complete Registration Number.</p>
                    ) : null}
                </div>

                {regValid ? (
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="registrationCertFile">Registration Certificate</RequiredLabel>
                        <input
                            ref={regFileInputRef}
                            id="registrationCertFile"
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            onChange={(e) => void handleRegistrationCertFile(e)}
                            disabled={regCertBusy}
                        />
                        {!registrationCertificate ? (
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={regCertBusy}
                                onClick={() => regFileInputRef.current?.click()}
                            >
                                {regCertBusy ? 'Uploading…' : 'Upload registration certificate'}
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
                                <p className="text-sm text-foreground">{registrationCertificate.fileName}</p>
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" className="h-10 flex-1" onClick={() => regFileInputRef.current?.click()} disabled={regCertBusy}>
                                        Replace file
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-10 flex-1"
                                        onClick={() => {
                                            if (registrationCertificate.previewUrl?.startsWith('blob:')) {
                                                URL.revokeObjectURL(registrationCertificate.previewUrl);
                                            }
                                            onRegistrationCertificateChange(null);
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}

                <Separator />

                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="bio">About your business</RequiredLabel>
                    <Textarea id="bio" className="h-24 text-sm" value={data.bio} onChange={(e) => onChange({ bio: e.target.value })} placeholder="What should homeowners know before they call?" />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="highlights">Highlights</RequiredLabel>
                    <Textarea
                        id="highlights"
                        className="h-24 text-sm"
                        value={data.highlights}
                        onChange={(e) => onChange({ highlights: e.target.value })}
                        placeholder="Warranty, speed, materials you prefer, areas of expertise…"
                    />
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="certifications">Certifications (text)</RequiredLabel>
                    <Textarea
                        id="certifications"
                        className="h-24 text-sm"
                        value={data.certifications}
                        onChange={(e) => onChange({ certifications: e.target.value })}
                        placeholder="List qualifications — comma-separated"
                    />
                    <div className="flex flex-wrap gap-2">
                        {certificationChips.map((chip, index) => (
                            <Badge key={`${chip}-${index}`} variant="secondary">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="certLabel">Certification documents</OptionalLabel>
                    <p className="text-xs text-muted-foreground">PDF or photo for each ticket, trade test, or membership. Add a label, then upload.</p>
                    <Input
                        id="certLabel"
                        className="h-10 text-sm"
                        value={certLabelDraft}
                        onChange={(e) => setCertLabelDraft(e.target.value)}
                        placeholder="e.g. NQF Painting trade test"
                    />
                    <input
                        ref={certFileInputRef}
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(ev) => void handleCertificationFile(ev)}
                        disabled={certFileBusy}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full"
                        disabled={certFileBusy}
                        onClick={() => certFileInputRef.current?.click()}
                    >
                        {certFileBusy ? 'Uploading…' : 'Upload certification file'}
                    </Button>
                    {certificationFiles.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                            {certificationFiles.map((c) => (
                                <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                                    <span className="min-w-0 truncate">
                                        {c.label} — {c.path.split('/').pop()}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 shrink-0"
                                        onClick={() => {
                                            if (c.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(c.previewUrl);
                                            onCertificationFilesChange(certificationFiles.filter((x) => x.id !== c.id));
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>

                <Separator />

                <div className="flex flex-col gap-4 pb-22">
                    <RequiredLabel htmlFor="referralSource">How did you hear about Menda?</RequiredLabel>
                    <Select value={data.referralSource} onValueChange={(v) => onChange({ referralSource: v })}>
                        <SelectTrigger id="referralSource" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                            <SelectValue placeholder="Select referral source" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Instagram">Instagram</SelectItem>
                            <SelectItem value="Facebook">Facebook</SelectItem>
                            <SelectItem value="Google">Google</SelectItem>
                            <SelectItem value="Contractor">Contractor Referral</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                    {data.referralSource === 'Other' ? (
                        <div className="flex flex-col gap-4">
                            <RequiredLabel htmlFor="referralOther">Tell us more</RequiredLabel>
                            <Input id="referralOther" className="h-10" value={data.referralOther} onChange={(e) => onChange({ referralOther: e.target.value })} placeholder="Please specify" />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function StepKyc({
    kycId,
    kycSelfie,
    onKycIdChange,
    onKycSelfieChange,
}: {
    kycId: KycFile | null;
    kycSelfie: KycFile | null;
    onKycIdChange: (next: KycFile | null) => void;
    onKycSelfieChange: (next: KycFile | null) => void;
}) {
    const [busyId, setBusyId] = useState(false);
    const [busySelfie, setBusySelfie] = useState(false);
    const idRef = useRef<HTMLInputElement>(null);
    const selfieRef = useRef<HTMLInputElement>(null);

    const uploadKyc = async (kind: 'kyc_id' | 'kyc_selfie', file: File, setter: typeof onKycIdChange, setBusy: (b: boolean) => void) => {
        setBusy(true);
        try {
            const fd = new FormData();
            fd.set('kind', kind);
            fd.set('file', file);
            const res = await fetch('/api/providers/application-document', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as { path?: string; bucket?: string; fileName?: string; error?: string } | null;
            if (!res.ok || !json?.path || !json.bucket) {
                toast.error(json?.error || 'Upload failed.');
                return;
            }
            const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
            setter({
                path: json.path,
                bucket: json.bucket,
                fileName: json.fileName || file.name,
                previewUrl,
            });
            toast.success(kind === 'kyc_id' ? 'ID document saved.' : 'Selfie saved.');
        } catch {
            toast.error('Could not upload.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Identity (optional)"
                description="Helps us confirm you are a real tradesperson. SA ID or passport photo, plus a selfie. Our team may review these manually — you can skip if you prefer."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <OptionalLabel>ID or passport</OptionalLabel>
                    <input
                        ref={idRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (e.target) e.target.value = '';
                            if (!f) return;
                            void uploadKyc('kyc_id', f, onKycIdChange, setBusyId);
                        }}
                        disabled={busyId}
                    />
                    {kycId ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3 text-sm">
                            <span className="truncate">{kycId.fileName}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 shrink-0"
                                onClick={() => {
                                    if (kycId.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(kycId.previewUrl);
                                    onKycIdChange(null);
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <Button type="button" variant="secondary" className="h-10 w-full" disabled={busyId} onClick={() => idRef.current?.click()}>
                            {busyId ? 'Uploading…' : 'Upload ID or passport'}
                        </Button>
                    )}
                </div>
                <div className="flex flex-col gap-3">
                    <OptionalLabel>Selfie</OptionalLabel>
                    <input
                        ref={selfieRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (e.target) e.target.value = '';
                            if (!f) return;
                            void uploadKyc('kyc_selfie', f, onKycSelfieChange, setBusySelfie);
                        }}
                        disabled={busySelfie}
                    />
                    {kycSelfie ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-input p-3 text-sm">
                            <span className="truncate">{kycSelfie.fileName}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 shrink-0"
                                onClick={() => {
                                    if (kycSelfie.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(kycSelfie.previewUrl);
                                    onKycSelfieChange(null);
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    ) : (
                        <Button type="button" variant="secondary" className="h-10 w-full" disabled={busySelfie} onClick={() => selfieRef.current?.click()}>
                            {busySelfie ? 'Uploading…' : 'Upload selfie'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function Step6({
    uploads,
    onUploadsChange,
    contractorType,
}: {
    uploads: UploadedImage[];
    onUploadsChange: (next: UploadedImage[]) => void;
    contractorType: ContractorType | '';
}) {
    const [galleryAddOpen, setGalleryAddOpen] = useState(false);
    const [galleryDraftItems, setGalleryDraftItems] = useState<GalleryDraftItem[]>([]);
    const [galleryUploading, setGalleryUploading] = useState(false);
    const [galleryModalError, setGalleryModalError] = useState<string | null>(null);
    const galleryModalInputRef = useRef<HTMLInputElement>(null);

    const removeGalleryDraftItem = (id: string) => {
        setGalleryDraftItems((prev) => {
            const item = prev.find((p) => p.id === id);
            if (item) URL.revokeObjectURL(item.preview);
            return prev.filter((p) => p.id !== id);
        });
    };

    const updateGalleryDraftCaption = (id: string, caption: string) => {
        setGalleryDraftItems((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
    };

    const handleGalleryModalFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list?.length) return;
        setGalleryModalError(null);
        setGalleryDraftItems((prev) => {
            const next = [...prev];
            for (const file of Array.from(list)) {
                if (!file.type.startsWith('image/')) continue;
                next.push({
                    id: createClientId(),
                    file,
                    caption: '',
                    preview: URL.createObjectURL(file),
                });
            }
            return next;
        });
        e.target.value = '';
    };

    const handleGalleryModalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (galleryDraftItems.length === 0) return;
        setGalleryUploading(true);
        setGalleryModalError(null);
        try {
            const fd = new FormData();
            for (const item of galleryDraftItems) {
                fd.append('files', item.file);
            }
            const res = await fetch('/api/providers/application-images', { method: 'POST', body: fd });
            const json = (await res.json().catch(() => null)) as { images?: Array<{ path: string; bucket: string }>; error?: string } | null;
            if (!res.ok || !json?.images?.length) {
                setGalleryModalError(json?.error || 'Upload failed.');
                return;
            }
            const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const fresh: UploadedImage[] = json.images.map((item, i) => ({
                id: createClientId(),
                path: item.path,
                bucket: item.bucket,
                caption: galleryDraftItems[i]?.caption.trim() || null,
                previewUrl: `${base}/storage/v1/object/public/${item.bucket}/${item.path}`,
            }));
            onUploadsChange([...uploads, ...fresh]);
            setGalleryDraftItems((prev) => {
                prev.forEach((p) => URL.revokeObjectURL(p.preview));
                return [];
            });
            toast.success('Images queued for review.');
            setGalleryAddOpen(false);
        } finally {
            setGalleryUploading(false);
        }
    };

    const openGalleryAddDialog = () => {
        setGalleryDraftItems((prev) => {
            prev.forEach((p) => URL.revokeObjectURL(p.preview));
            return [];
        });
        setGalleryModalError(null);
        setGalleryAddOpen(true);
    };

    const removeUpload = (id: string) => onUploadsChange(uploads.filter((u) => u.id !== id));

    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Work photos"
                description={
                    contractorType === 'individual'
                        ? 'Show recent jobs if you have them — optional for solo applicants, but photos lift trust when homeowners compare you.'
                        : 'Add at least one photo of your work so we can review quality. More is better.'
                }
            />
            <input
                ref={galleryModalInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleGalleryModalFiles}
            />

            <div className="flex flex-col gap-4">
                <Button type="button" variant="secondary" className="h-10 w-full" disabled={galleryUploading} onClick={openGalleryAddDialog}>
                    Add work photos
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP or GIF — up to 10MB each.</p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {uploads.map((item) => (
                    <div key={item.id} className="rounded-lg border border-input p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.previewUrl} alt={item.caption || 'Uploaded image'} className="h-24 w-full rounded object-cover" />
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.caption || 'No caption'}</p>
                        <Button type="button" variant="ghost" className="mt-1 h-8 w-full" onClick={() => removeUpload(item.id)}>
                            Remove
                        </Button>
                    </div>
                ))}
            </div>

            <Dialog
                open={galleryAddOpen}
                onOpenChange={(open) => {
                    setGalleryAddOpen(open);
                    if (!open) {
                        setGalleryDraftItems((prev) => {
                            prev.forEach((p) => URL.revokeObjectURL(p.preview));
                            return [];
                        });
                        setGalleryModalError(null);
                    }
                }}
            >
                <DialogContent showCloseButton={false} className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
                    <form onSubmit={(e) => void handleGalleryModalSubmit(e)} className="flex flex-col gap-6">
                        <DialogHeader className="gap-3 text-left">
                            <DialogTitle className="text-left leading-none">Add photos</DialogTitle>
                            <DialogDescription className="text-left text-muted-foreground">
                                Choose clear shots of finished work. Short captions help reviewers understand each job.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-4">
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={galleryUploading}
                                onClick={() => galleryModalInputRef.current?.click()}
                            >
                                Select images
                            </Button>
                        </div>

                        {galleryDraftItems.length > 0 ? (
                            <div className="flex flex-col gap-6">
                                {galleryDraftItems.map((item) => (
                                    <div key={item.id} className="flex flex-col gap-4 rounded-lg border border-border/75 p-4">
                                        <div className="w-full overflow-hidden rounded-md bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={item.preview} alt="" className="max-h-52 w-full object-cover" />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <Label htmlFor={`cap-${item.id}`}>Caption</Label>
                                            <Textarea
                                                id={`cap-${item.id}`}
                                                value={item.caption}
                                                onChange={(e) => updateGalleryDraftCaption(item.id, e.target.value)}
                                                className="min-h-[48px] resize-y text-sm"
                                            />
                                        </div>
                                        <Button type="button" variant="ghost" className="h-10 w-full shrink-0" onClick={() => removeGalleryDraftItem(item.id)}>
                                            Remove Image
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {galleryModalError ? <p className="text-sm text-destructive">{galleryModalError}</p> : null}

                        <DialogFooter>
                            <Button type="button" className="h-10 min-h-10 flex-1" variant="ghost" onClick={() => setGalleryAddOpen(false)} disabled={galleryUploading}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="h-10 min-h-10 flex-1"
                                disabled={galleryUploading || galleryDraftItems.length === 0}
                            >
                                {galleryUploading ? 'Submitting…' : 'Share Review'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-input bg-card p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">{title}</p>
            <div className="flex flex-col gap-1.5 text-sm">{children}</div>
        </div>
    );
}

function wtpLabel(band: string): string {
    const o = WILLINGNESS_OPTIONS.find((x) => x.value === band);
    return o?.label ?? (band || '—');
}

function contractorTypeLabel(t: ContractorType | ''): string {
    if (t === 'individual') return 'Individual';
    if (t === 'team') return 'Team';
    if (t === 'enterprise') return 'Enterprise';
    return '—';
}

function Step7({
    data,
    radii,
    uploads,
    registrationCertificate,
    certificationFiles,
    kycId,
    kycSelfie,
}: {
    data: FormData;
    radii: ServiceRadius[];
    uploads: UploadedImage[];
    registrationCertificate: RegistrationCertificate | null;
    certificationFiles: CertificationFile[];
    kycId: KycFile | null;
    kycSelfie: KycFile | null;
}) {
    const referralLabel =
        data.referralSource === 'Other' ? data.referralOther.trim() || 'Other' : data.referralSource || '—';
    return (
        <div className="flex flex-col gap-8">
            <StepHeader
                title="Review and submit"
                description="Check everything below. You can use Back to fix a step before sending your application."
            />
            <div className="flex flex-col gap-6">
                <SummaryCard title="How you work">
                    <p className="text-muted-foreground">Type: {contractorTypeLabel(data.contractorType)}</p>
                    <p className="text-muted-foreground">Comfortable monthly range: {wtpLabel(data.willingnessToPayBand)}</p>
                    {data.applicantGooglePlaceId ? (
                        <p className="text-muted-foreground break-all text-xs">Maps listing: {data.applicantGooglePlaceId}</p>
                    ) : (
                        <p className="text-muted-foreground">Maps listing: not linked</p>
                    )}
                </SummaryCard>
                <SummaryCard title="Business">
                    <p>{data.businessName || '—'}</p>
                    <p className="text-muted-foreground">{data.contactPerson || '—'}</p>
                    <p className="text-muted-foreground">{data.emailAddress || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Contact Details">
                    <p>{data.address || '—'}</p>
                    <p className="text-muted-foreground">{data.phone || '—'}</p>
                    <p className="text-muted-foreground">{data.whatsappAvailable ? 'WhatsApp enabled' : 'WhatsApp disabled'}</p>
                    <p className="text-muted-foreground">{data.website || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Service Areas">
                    {radii.length > 0 ? (
                        radii.map((r) => (
                            <p key={r.id} className="text-muted-foreground">
                                {r.address} ({r.radiusKm} km)
                            </p>
                        ))
                    ) : (
                        <p className="text-muted-foreground">—</p>
                    )}
                </SummaryCard>
                <SummaryCard title="Trade Profile">
                    <p>{data.trade || '—'}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{data.specialisations || '—'}</p>
                </SummaryCard>
                <SummaryCard title="Business Profile">
                    <p className="text-muted-foreground">Founded year: {data.foundedYear || '—'}</p>
                    <p className="text-muted-foreground">Team size: {data.teamSize || '—'}</p>
                    <p className="text-muted-foreground">Registration: {data.registrationNumber || '—'}</p>
                    {registrationCertificate ? (
                        <p className="text-muted-foreground">Registration certificate: {registrationCertificate.fileName}</p>
                    ) : null}
                    <p className="text-muted-foreground">Bio: {data.bio || '—'}</p>
                    <p className="text-muted-foreground">Certifications: {data.certifications || '—'}</p>
                    {certificationFiles.length > 0 ? (
                        <p className="text-muted-foreground">Certification files: {certificationFiles.map((c) => c.label).join(', ')}</p>
                    ) : null}
                    <p className="text-muted-foreground">Highlights: {data.highlights || '—'}</p>
                    <p className="text-muted-foreground">Referral: {referralLabel}</p>
                </SummaryCard>
                <SummaryCard title="Identity uploads">
                    <p className="text-muted-foreground">ID document: {kycId ? kycId.fileName : '—'}</p>
                    <p className="text-muted-foreground">Selfie: {kycSelfie ? kycSelfie.fileName : '—'}</p>
                </SummaryCard>
                <SummaryCard title="Work photos">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        {uploads.map((item) => (
                            <div key={item.id} className="rounded-md border border-input p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.previewUrl} alt={item.caption || 'Uploaded image'} className="h-24 w-full rounded object-cover" />
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.caption || 'No caption'}</p>
                            </div>
                        ))}
                    </div>
                </SummaryCard>
            </div>
        </div>
    );
}

function SuccessScreen() {
    const router = useRouter();
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-background">
                    <path d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold text-foreground">Application Received</h1>
                <p className="max-w-sm text-base text-muted-foreground">
                    Thank you for applying to join the Menda contractor network. We&apos;ll review your application and be in touch within 2 business days.
                </p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/contractors')}>
                Back To Pro Page
            </Button>
        </div>
    );
}

function isReservedUploadCaption(c: string | null | undefined): boolean {
    if (!c) return false;
    if (c === REGISTRATION_CERT_CAPTION) return true;
    if (c.startsWith('Certification:')) return true;
    if (c === KYC_ID_CAPTION || c === KYC_SELFIE_CAPTION) return true;
    return false;
}

export default function ProOnboardPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [data, setData] = useState<FormData>(EMPTY_FORM);
    const [radii, setRadii] = useState<ServiceRadius[]>([]);
    const [uploads, setUploads] = useState<UploadedImage[]>([]);
    const [registrationCertificate, setRegistrationCertificate] = useState<RegistrationCertificate | null>(null);
    const [certificationFiles, setCertificationFiles] = useState<CertificationFile[]>([]);
    const [kycId, setKycId] = useState<KycFile | null>(null);
    const [kycSelfie, setKycSelfie] = useState<KycFile | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const [existingDialogOpen, setExistingDialogOpen] = useState(false);
    const [existingApplication, setExistingApplication] = useState<ExistingApplicationRow | null>(null);
    const [existingDialogBusy, setExistingDialogBusy] = useState(false);
    const [sessionLoaded, setSessionLoaded] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const [footerHeight, setFooterHeight] = useState(0);

    const maxRadii = maxServiceRadiiForType(data.contractorType);

    useEffect(() => {
        const max = maxServiceRadiiForType(data.contractorType);
        setRadii((prev) => (prev.length > max ? prev.slice(0, max) : prev));
    }, [data.contractorType]);

    const patchRadiusRow = useCallback((id: string, patchRow: Partial<ServiceRadius>) => {
        setRadii((prev) => prev.map((r) => (r.id === id ? { ...r, ...patchRow } : r)));
    }, []);

    useLayoutEffect(() => {
        const footerEl = footerRef.current;
        if (!footerEl) {
            setFooterHeight(0);
            return;
        }
        const updateFooterHeight = () => {
            const h = footerEl.getBoundingClientRect().height;
            setFooterHeight(Number.isFinite(h) ? Math.ceil(h) : footerEl.offsetHeight);
        };
        updateFooterHeight();
        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => updateFooterHeight());
            resizeObserver.observe(footerEl);
        }
        window.addEventListener('resize', updateFooterHeight);
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        vv?.addEventListener('resize', updateFooterHeight);
        vv?.addEventListener('scroll', updateFooterHeight);
        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateFooterHeight);
            vv?.removeEventListener('resize', updateFooterHeight);
            vv?.removeEventListener('scroll', updateFooterHeight);
        };
    }, [step, submitting]);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (raw) {
                const d = JSON.parse(raw) as {
                    step?: number;
                    data?: FormData;
                    radii?: ServiceRadius[];
                    uploads?: UploadedImage[];
                    registrationCertificate?: RegistrationCertificate | null;
                    certificationFiles?: CertificationFile[];
                    kycId?: KycFile | null;
                    kycSelfie?: KycFile | null;
                };
                if (typeof d.step === 'number' && d.step >= 1 && d.step <= TOTAL_STEPS) setStep(d.step);
                if (d.data) setData({ ...EMPTY_FORM, ...d.data });
                if (Array.isArray(d.radii)) setRadii(d.radii);
                if (Array.isArray(d.uploads)) setUploads(d.uploads);
                if (d.registrationCertificate !== undefined) setRegistrationCertificate(d.registrationCertificate);
                if (Array.isArray(d.certificationFiles)) setCertificationFiles(d.certificationFiles);
                if (d.kycId !== undefined) setKycId(d.kycId);
                if (d.kycSelfie !== undefined) setKycSelfie(d.kycSelfie);
            }
        } catch {
            /* ignore */
        }
        setSessionLoaded(true);
    }, []);

    useEffect(() => {
        if (!sessionLoaded || submitted) return;
        try {
            sessionStorage.setItem(
                SESSION_KEY,
                JSON.stringify({
                    step,
                    data,
                    radii,
                    uploads,
                    registrationCertificate,
                    certificationFiles,
                    kycId,
                    kycSelfie,
                })
            );
        } catch {
            /* ignore */
        }
    }, [sessionLoaded, submitted, step, data, radii, uploads, registrationCertificate, certificationFiles, kycId, kycSelfie]);

    useEffect(() => {
        if (step !== STEP.TRADE || services.length > 0) return;
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

    useEffect(() => {
        if (step !== STEP.SERVICE) return;
        setRadii((prev) => {
            if (prev.length > 0) return prev;
            const seed = data.address.trim();
            return [{ id: createClientId(), address: seed, lat: 0, lng: 0, radiusKm: DEFAULT_SERVICE_RADIUS_KM }];
        });
    }, [step, data.address]);

    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [step]);

    const isDirty = useMemo(() => {
        const hasFormData = Object.entries(data).some(([key, value]) => {
            if (typeof value === 'string') return value.trim().length > 0;
            if (typeof value === 'boolean') return value;
            return false;
        });
        return (
            hasFormData ||
            radii.some((r) => r.address.trim().length > 0 || r.lat !== 0) ||
            uploads.length > 0 ||
            registrationCertificate !== null ||
            certificationFiles.length > 0 ||
            kycId !== null ||
            kycSelfie !== null
        );
    }, [data, radii, uploads.length, registrationCertificate, certificationFiles.length, kycId, kycSelfie]);

    const hydrateFromExisting = useCallback((app: ExistingApplicationRow) => {
        const nextRadii: ServiceRadius[] = Array.isArray(app.service_areas)
            ? app.service_areas
                  .map((item) => ({
                      id: createClientId(),
                      address: typeof item?.address === 'string' ? item.address : '',
                      lat: typeof item?.lat === 'number' ? item.lat : 0,
                      lng: typeof item?.lng === 'number' ? item.lng : 0,
                      radiusKm: typeof item?.radius_km === 'number' ? item.radius_km : 10,
                  }))
                  .filter((item) => item.address && Number.isFinite(item.lat) && Number.isFinite(item.lng))
            : [];

        const imageRows = Array.isArray(app.application_images) ? app.application_images : [];
        const regRow = imageRows.find((item) => item.caption === REGISTRATION_CERT_CAPTION);
        const nextUploads: UploadedImage[] = imageRows
            .filter((item) => !isReservedUploadCaption(item.caption))
            .map((item) => ({
                id: createClientId(),
                path: item.path,
                bucket: item.bucket || 'gallery',
                caption: item.caption || null,
                previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${item.bucket || 'gallery'}/${item.path}`,
            }));

        const certRows = imageRows.filter((i) => typeof i.caption === 'string' && i.caption.startsWith('Certification:'));
        const nextCerts: CertificationFile[] = certRows.map((row) => ({
            id: createClientId(),
            path: row.path,
            bucket: row.bucket || 'gallery',
            label: (row.caption as string).slice('Certification:'.length).trim() || 'Certificate',
            previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${row.bucket || 'gallery'}/${row.path}`,
        }));

        const kycDoc = app.kyc_documents;
        const idRow = imageRows.find((i) => i.caption === KYC_ID_CAPTION);
        const selfieRow = imageRows.find((i) => i.caption === KYC_SELFIE_CAPTION);

        setData({
            ...EMPTY_FORM,
            contractorType:
                app.contractor_type === 'individual' || app.contractor_type === 'team' || app.contractor_type === 'enterprise'
                    ? app.contractor_type
                    : '',
            willingnessToPayBand: app.willingness_to_pay_band || '',
            applicantGooglePlaceId: app.applicant_google_place_id || '',
            businessName: app.business_name || '',
            contactPerson: app.contact_name || '',
            emailAddress: app.email || '',
            address: app.address || '',
            phone: app.phone ? formatSaPhoneDisplay(app.phone) : '',
            whatsappAvailable: app.whatsapp_available === true,
            website: app.website || '',
            trade: app.trade || '',
            specialisations: app.trade_description || '',
            foundedYear: typeof app.founded_year === 'number' ? String(app.founded_year) : '',
            teamSize: typeof app.team_size === 'number' ? String(app.team_size) : '',
            registrationNumber: app.registration_number || '',
            bio: typeof app.about === 'string' ? app.about : '',
            certifications: app.certifications || '',
            highlights: app.highlights || '',
            referralSource: app.referral || '',
            referralOther: '',
        });
        setRadii(nextRadii);
        setUploads(nextUploads);
        setCertificationFiles(nextCerts);
        setKycId(
            kycDoc?.idDocument?.path
                ? {
                      path: kycDoc.idDocument.path,
                      bucket: kycDoc.idDocument.bucket || 'gallery',
                      fileName: 'ID document',
                      previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${kycDoc.idDocument.bucket || 'gallery'}/${kycDoc.idDocument.path}`,
                  }
                : idRow
                  ? {
                        path: idRow.path,
                        bucket: idRow.bucket || 'gallery',
                        fileName: 'ID document',
                        previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${idRow.bucket || 'gallery'}/${idRow.path}`,
                    }
                  : null
        );
        setKycSelfie(
            kycDoc?.selfie?.path
                ? {
                      path: kycDoc.selfie.path,
                      bucket: kycDoc.selfie.bucket || 'gallery',
                      fileName: 'Selfie',
                      previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${kycDoc.selfie.bucket || 'gallery'}/${kycDoc.selfie.path}`,
                  }
                : selfieRow
                  ? {
                        path: selfieRow.path,
                        bucket: selfieRow.bucket || 'gallery',
                        fileName: 'Selfie',
                        previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${selfieRow.bucket || 'gallery'}/${selfieRow.path}`,
                    }
                  : null
        );
        setRegistrationCertificate(
            regRow
                ? {
                      id: createClientId(),
                      path: regRow.path,
                      bucket: regRow.bucket || 'gallery',
                      fileName: 'Registration certificate',
                      previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${regRow.bucket || 'gallery'}/${regRow.path}`,
                  }
                : null
        );
        setStep(STEP.CONTRACTOR_TYPE);
    }, []);

    const checkForExistingApplication = useCallback(
        async (phoneForLookup?: string) => {
            const phoneParam = phoneForLookup || toSaE164(data.phone) || '';
            const query = phoneParam ? `?phone=${encodeURIComponent(phoneParam)}` : '';
            const res = await fetch(`/api/providers/application-session${query}`);
            if (!res.ok) return;
            const json = (await res.json().catch(() => null)) as { application?: ExistingApplicationRow | null } | null;
            if (json?.application) {
                setExistingApplication(json.application);
                if (!isDirty) {
                    setExistingDialogOpen(true);
                }
            }
        },
        [data.phone, isDirty]
    );

    useEffect(() => {
        void checkForExistingApplication();
    }, [checkForExistingApplication]);

    useEffect(() => {
        const e164 = toSaE164(data.phone);
        if (!e164) return;
        void checkForExistingApplication(e164);
    }, [checkForExistingApplication, data.phone]);

    const patch = useCallback((update: Partial<FormData>) => {
        setData((prev) => ({ ...prev, ...update }));
    }, []);

    const ensureAddress = useCallback(async (): Promise<boolean> => {
        const trimmed = data.address.trim();
        if (!trimmed) return false;
        const geo = await geocodeApi({ address: trimmed, westernCapeOnly: true });
        if (!geo?.address || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
            toast.error(geo?.error || 'Please provide a specific address.');
            return false;
        }
        patch({ address: geo.address });
        return true;
    }, [data.address, patch]);

    const applyPlacePrefill = useCallback(
        (details: PlaceDetailsPayload) => {
            patch({
                businessName: toTitleCaseWords(details.businessName),
                address: details.address,
                phone: details.phone ? formatSaPhoneDisplay(details.phone) : '',
                website: details.website ? normalizeWebsiteToHttps(details.website) : '',
                applicantGooglePlaceId: details.placeId,
            });
            if (
                details.lat != null &&
                details.lng != null &&
                Number.isFinite(details.lat) &&
                Number.isFinite(details.lng)
            ) {
                setRadii([
                    {
                        id: createClientId(),
                        address: details.address,
                        lat: details.lat,
                        lng: details.lng,
                        radiusKm: DEFAULT_SERVICE_RADIUS_KM,
                    },
                ]);
            }
        },
        [patch]
    );

    function radiiStepValid(): boolean {
        if (radii.length < 1 || radii.length > maxRadii) return false;
        return radii.every(
            (r) =>
                r.lat !== 0 &&
                r.lng !== 0 &&
                r.address.trim().length > 0 &&
                r.radiusKm >= 1 &&
                r.radiusKm <= 100
        );
    }

    function canContinue(): boolean {
        if (step === STEP.CONTRACTOR_TYPE) {
            return data.contractorType === 'individual' || data.contractorType === 'team' || data.contractorType === 'enterprise';
        }
        if (step === STEP.WILLINGNESS_TO_PAY) {
            return WILLINGNESS_OPTIONS.some((o) => o.value === data.willingnessToPayBand);
        }
        if (step === STEP.COMPANY_SEARCH) return true;
        if (step === STEP.BASICS) {
            return (
                data.businessName.trim().length >= 2 &&
                data.businessName.trim().length <= 90 &&
                data.contactPerson.trim().length >= 3 &&
                data.contactPerson.trim().length <= 90 &&
                isValidEmail(data.emailAddress)
            );
        }
        if (step === STEP.CONTACT) {
            return Boolean(data.address.trim()) && Boolean(toSaE164(data.phone));
        }
        if (step === STEP.SERVICE) return radiiStepValid();
        if (step === STEP.TRADE) return Boolean(data.trade.trim() && tokenizeCsv(data.specialisations).length > 0);
        if (step === STEP.PROFILE) {
            const year = Number(data.foundedYear);
            const team = Number(data.teamSize);
            const regPartial = data.registrationNumber.trim().length > 0 && !isValidSaRegistrationNumber(data.registrationNumber);
            if (regPartial) return false;
            if (isValidSaRegistrationNumber(data.registrationNumber) && !registrationCertificate) return false;
            return (
                Number.isInteger(year) &&
                year >= 1900 &&
                year <= new Date().getFullYear() &&
                Number.isInteger(team) &&
                team >= 1 &&
                data.bio.trim().length > 0 &&
                tokenizeCsv(data.certifications).length > 0 &&
                data.highlights.trim().length > 0 &&
                data.referralSource.trim().length > 0 &&
                (data.referralSource !== 'Other' || data.referralOther.trim().length > 0)
            );
        }
        if (step === STEP.KYC) return true;
        if (step === STEP.GALLERY) {
            if (data.contractorType === 'individual') return true;
            return uploads.length > 0;
        }
        return true;
    }

    async function handleContinue() {
        if (step === STEP.CONTACT) {
            const validAddress = await ensureAddress();
            if (!validAddress) return;
        }
        if (step < TOTAL_STEPS) {
            setStep((s) => s + 1);
            return;
        }

        setSubmitting(true);
        try {
            const uploadsPayload = [
                ...uploads.map(({ path, bucket, caption }) => ({ path, bucket, caption })),
                ...(registrationCertificate
                    ? [{ path: registrationCertificate.path, bucket: registrationCertificate.bucket, caption: REGISTRATION_CERT_CAPTION }]
                    : []),
                ...certificationFiles.map((c) => ({
                    path: c.path,
                    bucket: c.bucket,
                    caption: certificationCaption(c.label),
                })),
                ...(kycId ? [{ path: kycId.path, bucket: kycId.bucket, caption: KYC_ID_CAPTION }] : []),
                ...(kycSelfie ? [{ path: kycSelfie.path, bucket: kycSelfie.bucket, caption: KYC_SELFIE_CAPTION }] : []),
            ];
            const res = await fetch('/api/providers/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contractorType: data.contractorType,
                    willingnessToPayBand: data.willingnessToPayBand,
                    applicantGooglePlaceId: data.applicantGooglePlaceId.trim() || undefined,
                    kycDocuments: {
                        ...(kycId ? { idDocument: { path: kycId.path, bucket: kycId.bucket } } : {}),
                        ...(kycSelfie ? { selfie: { path: kycSelfie.path, bucket: kycSelfie.bucket } } : {}),
                    },
                    businessName: data.businessName,
                    contactPerson: data.contactPerson,
                    emailAddress: data.emailAddress,
                    address: data.address,
                    phone: toSaE164(data.phone),
                    whatsappAvailable: data.whatsappAvailable,
                    website: data.website,
                    trade: data.trade,
                    specialisations: tokenizeCsv(data.specialisations).join(', '),
                    foundedYear: data.foundedYear,
                    teamSize: data.teamSize,
                    registrationNumber: data.registrationNumber,
                    certifications: tokenizeCsv(data.certifications).join(', '),
                    bio: data.bio,
                    highlights: data.highlights,
                    referralSource: data.referralSource,
                    referralOther: data.referralOther,
                    serviceAreas: radii.map((r) => `${r.address} (${r.radiusKm}km)`).join(', '),
                    serviceAreaRadii: radii,
                    uploads: uploadsPayload,
                    clientApplicationId: createClientId(),
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                toast.error((json as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.');
                return;
            }
            try {
                sessionStorage.removeItem(SESSION_KEY);
            } catch {
                /* ignore */
            }
            setSubmitted(true);
        } catch {
            toast.error('Could not submit your application. Check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    if (submitted) return <SuccessScreen />;
    const stepProps = { data, onChange: patch };
    /** Scroll clearance so the last field (e.g. referral) sits above the fixed footer — spacer + flex fix below. */
    const bottomScrollClearancePx = Math.max(footerHeight + FOOTER_SCROLL_GAP_PX, FOOTER_SCROLL_MIN_PX + FOOTER_SCROLL_GAP_PX);

    return (
        <div className="flex h-dvh flex-col overflow-hidden overscroll-none bg-background">
            <FlowStepHeader
                step={step}
                onBack={() => {
                    if (step > 1) {
                        setStep((s) => s - 1);
                        return;
                    }
                    if (isDirty) {
                        setLeaveDialogOpen(true);
                        return;
                    }
                    router.push('/contractors');
                }}
                centerLabel="Menda"
            />
            <main
                ref={contentRef}
                className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 pt-20 sm:px-6"
            >
                <div className="flex w-full min-w-0 max-w-xl flex-col gap-8">
                    {step === STEP.CONTRACTOR_TYPE && <StepContractorType {...stepProps} />}
                    {step === STEP.WILLINGNESS_TO_PAY && <StepWillingnessToPay {...stepProps} />}
                    {step === STEP.COMPANY_SEARCH && (
                        <StepCompanySearch
                            selectedPlaceId={data.applicantGooglePlaceId}
                            onPrefill={applyPlacePrefill}
                            onSkip={() => patch({ applicantGooglePlaceId: '' })}
                        />
                    )}
                    {step === STEP.BASICS && <StepBasics {...stepProps} />}
                    {step === STEP.CONTACT && <Step2 {...stepProps} onEnsureAddress={ensureAddress} />}
                    {step === STEP.SERVICE && (
                        <StepServiceAreas maxRadii={maxRadii} radii={radii} onRadiiChange={setRadii} patchRadiusRow={patchRadiusRow} />
                    )}
                    {step === STEP.TRADE && <Step4 {...stepProps} services={services} servicesLoading={servicesLoading} />}
                    {step === STEP.PROFILE && (
                        <Step5
                            {...stepProps}
                            registrationCertificate={registrationCertificate}
                            onRegistrationCertificateChange={setRegistrationCertificate}
                            certificationFiles={certificationFiles}
                            onCertificationFilesChange={setCertificationFiles}
                        />
                    )}
                    {step === STEP.KYC && (
                        <StepKyc kycId={kycId} kycSelfie={kycSelfie} onKycIdChange={setKycId} onKycSelfieChange={setKycSelfie} />
                    )}
                    {step === STEP.GALLERY && (
                        <Step6 contractorType={data.contractorType} uploads={uploads} onUploadsChange={setUploads} />
                    )}
                    {step === STEP.CONFIRM && (
                        <Step7
                            data={data}
                            radii={radii}
                            uploads={uploads}
                            registrationCertificate={registrationCertificate}
                            certificationFiles={certificationFiles}
                            kycId={kycId}
                            kycSelfie={kycSelfie}
                        />
                    )}
                    {/* In-flow clearance so fields are not covered by the fixed footer; more reliable than padding-only with flex stretch */}
                    <div
                        aria-hidden
                        className="shrink-0"
                        style={{ height: `${bottomScrollClearancePx}px`, minHeight: `${bottomScrollClearancePx}px` }}
                    />
                </div>
            </main>
            <div
                ref={footerRef}
                className="fixed inset-x-0 bottom-0 z-40 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
                <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
                    <Button type="button" className="h-10 w-full" disabled={!canContinue() || submitting} onClick={handleContinue}>
                        {submitting ? 'Submitting...' : step === TOTAL_STEPS ? 'Submit Application' : 'Continue'}
                    </Button>
                </div>
            </div>

            <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Leave Application?</DialogTitle>
                        <DialogDescription>
                            Going back now will discard your onboarding progress.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="ghost" className="h-10 flex-1" onClick={() => setLeaveDialogOpen(false)}>
                            Continue Application
                        </Button>
                        <Button
                            type="button"
                            className="h-10 flex-1"
                            onClick={() => {
                                setLeaveDialogOpen(false);
                                router.push('/contractors');
                            }}
                        >
                            Lose Progress
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={existingDialogOpen} onOpenChange={setExistingDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Existing Application Found</DialogTitle>
                        <DialogDescription>
                            We found an existing provider application for this phone/IP. Do you want to continue it or delete and start over?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-10 flex-1"
                            disabled={existingDialogBusy || !existingApplication}
                            onClick={() => {
                                if (!existingApplication) return;
                                hydrateFromExisting(existingApplication);
                                setExistingDialogOpen(false);
                            }}
                        >
                            Continue Existing
                        </Button>
                        <Button
                            type="button"
                            className="h-10 flex-1"
                            disabled={existingDialogBusy || !existingApplication}
                            onClick={async () => {
                                if (!existingApplication) return;
                                setExistingDialogBusy(true);
                                try {
                                    const res = await fetch('/api/providers/application-session', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: existingApplication.id }),
                                    });
                                    if (!res.ok) {
                                        toast.error('Could not delete existing application.');
                                        return;
                                    }
                                    setExistingApplication(null);
                                    setData(EMPTY_FORM);
                                    setRadii([]);
                                    setUploads([]);
                                    setRegistrationCertificate(null);
                                    setCertificationFiles([]);
                                    setKycId(null);
                                    setKycSelfie(null);
                                    setStep(STEP.CONTRACTOR_TYPE);
                                    try {
                                        sessionStorage.removeItem(SESSION_KEY);
                                    } catch {
                                        /* ignore */
                                    }
                                    setExistingDialogOpen(false);
                                } finally {
                                    setExistingDialogBusy(false);
                                }
                            }}
                        >
                            Delete And Start Over
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
