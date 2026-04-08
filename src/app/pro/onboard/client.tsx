'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
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
import { getSupabase } from '@/lib/supabase';
import { geocodeApi } from '@/features/match/api/client';
import { createClientId } from '@/lib/client-random-id';
import { formatSaRegistrationInput, isValidSaRegistrationNumber, registrationNumberPlaceholder } from './sa-registration';

type Service = { id: string; label: string };
type UploadedImage = { id: string; path: string; bucket: string; caption: string | null; previewUrl?: string };
type RegistrationCertificate = { id: string; path: string; bucket: string; fileName: string; previewUrl?: string };
type GalleryDraftItem = { id: string; file: File; caption: string; preview: string };

const REGISTRATION_CERT_CAPTION = 'Registration certificate';
type ServiceRadius = { id: string; address: string; lat: number; lng: number; radiusKm: number };
type ExistingApplicationRow = {
    id: string;
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
    application_images: Array<{ path: string; bucket: string; caption?: string | null }> | null;
    service_areas: Array<{ address?: string; lat?: number; lng?: number; radius_km?: number }> | null;
};

const TOTAL_STEPS = 7;
const DEFAULT_SERVICE_RADIUS_KM = 10;
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.';
/** Space between the last field and the fixed footer (visual gap above the bar). */
const FOOTER_SCROLL_GAP_PX = 24;
/** Minimum bottom clearance when footer height is not measured yet (tall phones + safe area). */
const FOOTER_SCROLL_MIN_PX = 160;
type FormData = {
    businessName: string;
    contactPerson: string;
    emailAddress: string;
    address: string;
    phone: string;
    whatsappAvailable: boolean;
    website: string;
    serviceAreaAddress: string;
    serviceRadiusKm: string;
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
    businessName: '',
    contactPerson: '',
    emailAddress: '',
    address: '',
    phone: '',
    whatsappAvailable: false,
    website: '',
    serviceAreaAddress: '',
    serviceRadiusKm: String(DEFAULT_SERVICE_RADIUS_KM),
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

function StepTitle({ title }: { title: string }) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{LOREM}</p>
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

function Step1({ data, onChange }: { data: FormData; onChange: (patch: Partial<FormData>) => void }) {
    return (
        <div className="flex flex-col gap-8">
            <StepTitle title="Start Application" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="businessName">Business Name</RequiredLabel>
                    <Input id="businessName" className="h-10 text-sm" value={data.businessName} onChange={(e) => onChange({ businessName: e.target.value })} onBlur={(e) => onChange({ businessName: toTitleCaseWords(e.target.value) })} maxLength={90} autoFocus />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="contactPerson">Contact Person&apos;s Full Name</RequiredLabel>
                    <Input id="contactPerson" className="h-10 text-sm" value={data.contactPerson} onChange={(e) => onChange({ contactPerson: e.target.value })} onBlur={(e) => onChange({ contactPerson: toTitleCaseWords(e.target.value) })} maxLength={90} />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="emailAddress">Email Address</RequiredLabel>
                    <Input id="emailAddress" type="email" className="h-10 text-sm" value={data.emailAddress} onChange={(e) => onChange({ emailAddress: e.target.value })} placeholder="name@company.com" autoComplete="email" />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
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
            <StepTitle title="Contact Details" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="address">Address</RequiredLabel>
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
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>

                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="phone">Phone Number</RequiredLabel>
                    <Input
                        id="phone"
                        type="tel"
                        className="h-10 text-sm"
                        value={data.phone}
                        onChange={(e) => onChange({ phone: formatSaPhoneDisplay(e.target.value) })}
                        placeholder="+27 00 000 0000"
                    />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Checkbox id="whatsapp" checked={data.whatsappAvailable} onCheckedChange={(checked) => onChange({ whatsappAvailable: Boolean(checked) })} />
                        <label htmlFor="whatsapp" className="text-sm leading-relaxed text-foreground">
                            This is a registered WhatsApp number and leads can be sent directly to this number.
                        </label>
                    </div>
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
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
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
            </div>
        </div>
    );
}

function Step3({
    data,
    defaultAddress,
    radii,
    onChange,
    onRadiiChange,
}: {
    data: FormData;
    defaultAddress: string;
    radii: ServiceRadius[];
    onChange: (patch: Partial<FormData>) => void;
    onRadiiChange: (next: ServiceRadius[]) => void;
}) {
    const rowIdRef = useRef<string | null>(null);
    const handleMapSelect = useCallback(() => {}, []);
    const selectedId = radii[0]?.id ?? null;
    const preview = radii[0] ?? null;

    useEffect(() => {
        if (data.serviceAreaAddress.trim()) return;
        const fromContact = defaultAddress.trim();
        if (fromContact) onChange({ serviceAreaAddress: fromContact });
    }, [defaultAddress, data.serviceAreaAddress, onChange]);

    useEffect(() => {
        const addr = data.serviceAreaAddress.trim();
        const km = Number(data.serviceRadiusKm);
        if (!addr || !Number.isFinite(km) || km < 1 || km > 100) {
            onRadiiChange([]);
            return;
        }
        const handle = window.setTimeout(() => {
            void (async () => {
                const geo = await geocodeApi({ address: addr, westernCapeOnly: true });
                if (!geo?.address || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
                    onRadiiChange([]);
                    return;
                }
                if (!rowIdRef.current) rowIdRef.current = createClientId();
                const rounded = Math.min(100, Math.max(1, Math.round(km)));
                onRadiiChange([
                    {
                        id: rowIdRef.current,
                        address: geo.address,
                        lat: geo.lat,
                        lng: geo.lng,
                        radiusKm: rounded,
                    },
                ]);
            })();
        }, 450);
        return () => window.clearTimeout(handle);
    }, [data.serviceAreaAddress, data.serviceRadiusKm, onRadiiChange]);

    return (
        <div className="flex flex-col gap-8">
            <StepTitle title="Service Areas" />
            <div className="w-full max-w-full overflow-hidden rounded-lg border border-input/50 bg-background">
                <ServiceRadiusMap radii={radii} selectedId={selectedId} onSelect={handleMapSelect} />
                <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                    {preview ? `${preview.address} — ${preview.radiusKm} km service radius` : 'Enter a valid address to preview your service area.'}
                </div>
            </div>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="serviceAreaAddress">Service Area Address</RequiredLabel>
                    <Input
                        id="serviceAreaAddress"
                        className="h-10 text-sm"
                        value={data.serviceAreaAddress}
                        onChange={(e) => onChange({ serviceAreaAddress: e.target.value })}
                        onBlur={(e) => onChange({ serviceAreaAddress: toTitleCaseWords(e.target.value) })}
                        placeholder={defaultAddress.trim() || 'Street, suburb, city'}
                    />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="serviceRadiusKm">Service Radius (Km)</RequiredLabel>
                    <Input
                        id="serviceRadiusKm"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        className="h-10 text-sm"
                        value={data.serviceRadiusKm}
                        onChange={(e) => onChange({ serviceRadiusKm: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
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
            <StepTitle title="Trade & Specialisations" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="trade">Service</RequiredLabel>
                    {servicesLoading ? (
                        <div className="h-10 w-full animate-pulse rounded-md border border-border/50 bg-muted/40" />
                    ) : (
                        <Select value={data.trade} onValueChange={(v) => onChange({ trade: v })} disabled={services.length === 0}>
                            <SelectTrigger id="trade" className="h-10 min-h-10 w-full data-[size=default]:h-10">
                                <SelectValue placeholder="Select Service" />
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
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="specialisations">Specialisations</RequiredLabel>
                    <Textarea id="specialisations" className="h-24 text-sm" value={data.specialisations} onChange={(e) => onChange({ specialisations: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
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
}: {
    data: FormData;
    onChange: (patch: Partial<FormData>) => void;
    registrationCertificate: RegistrationCertificate | null;
    onRegistrationCertificateChange: (next: RegistrationCertificate | null) => void;
}) {
    const certificationChips = useMemo(() => tokenizeCsv(data.certifications), [data.certifications]);
    const regValid = isValidSaRegistrationNumber(data.registrationNumber);
    const regTouched = data.registrationNumber.trim().length > 0;
    const [regCertBusy, setRegCertBusy] = useState(false);

    const regFileInputRef = useRef<HTMLInputElement>(null);

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

    return (
        <div className="flex flex-col gap-8">
            <StepTitle title="Business Profile" />
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="foundedYear">Founded Year</RequiredLabel>
                        <Input id="foundedYear" type="number" inputMode="numeric" min="1900" max="2100" className="h-10" value={data.foundedYear} onChange={(e) => onChange({ foundedYear: e.target.value.replace(/[^\d]/g, '') })} />
                        <p className="text-xs text-muted-foreground">{LOREM}</p>
                    </div>
                    <div className="flex flex-col gap-4">
                        <RequiredLabel htmlFor="teamSize">Team Size</RequiredLabel>
                        <Input id="teamSize" type="number" inputMode="numeric" min="1" className="h-10" value={data.teamSize} onChange={(e) => onChange({ teamSize: e.target.value.replace(/[^\d]/g, '') })} />
                        <p className="text-xs text-muted-foreground">{LOREM}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <OptionalLabel htmlFor="registrationNumber">Registration Number</OptionalLabel>
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
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
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
                        <p className="text-xs text-muted-foreground">{LOREM}</p>
                    </div>
                ) : null}

                <Separator />

                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="bio">About</RequiredLabel>
                    <Textarea id="bio" className="h-24 text-sm" value={data.bio} onChange={(e) => onChange({ bio: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="highlights">Highlights</RequiredLabel>
                    <Textarea id="highlights" className="h-24 text-sm" value={data.highlights} onChange={(e) => onChange({ highlights: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                </div>
                <div className="flex flex-col gap-4">
                    <RequiredLabel htmlFor="certifications">Certifications</RequiredLabel>
                    <Textarea id="certifications" className="h-24 text-sm" value={data.certifications} onChange={(e) => onChange({ certifications: e.target.value })} />
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                    <div className="flex flex-wrap gap-2">
                        {certificationChips.map((chip, index) => (
                            <Badge key={`${chip}-${index}`} variant="secondary">
                                {chip}
                            </Badge>
                        ))}
                    </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-4 pb-22">
                    <RequiredLabel htmlFor="referralSource">Referral Source</RequiredLabel>
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
                    <p className="text-xs text-muted-foreground">{LOREM}</p>
                    {data.referralSource === 'Other' ? (
                        <div className="flex flex-col gap-4">
                            <RequiredLabel htmlFor="referralOther">Referral Detail</RequiredLabel>
                            <Input id="referralOther" className="h-10" value={data.referralOther} onChange={(e) => onChange({ referralOther: e.target.value })} placeholder="Please specify" />
                            <p className="text-xs text-muted-foreground">{LOREM}</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function Step6({
    uploads,
    onUploadsChange,
}: {
    uploads: UploadedImage[];
    onUploadsChange: (next: UploadedImage[]) => void;
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
            <StepTitle title="Gallery Images" />
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
                    Share Images
                </Button>
                <p className="text-xs text-muted-foreground">{LOREM}</p>
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
                            <DialogTitle className="text-left leading-none">Share Images</DialogTitle>
                            <DialogDescription className="text-left text-muted-foreground">{LOREM}</DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col gap-4">
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-10 w-full"
                                disabled={galleryUploading}
                                onClick={() => galleryModalInputRef.current?.click()}
                            >
                                Select Images
                            </Button>
                            <p className="text-xs text-muted-foreground">{LOREM}</p>
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
                                            <p className="text-xs text-muted-foreground">{LOREM}</p>
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

function Step7({
    data,
    radii,
    uploads,
    registrationCertificate,
}: {
    data: FormData;
    radii: ServiceRadius[];
    uploads: UploadedImage[];
    registrationCertificate: RegistrationCertificate | null;
}) {
    const referralLabel =
        data.referralSource === 'Other' ? data.referralOther.trim() || 'Other' : data.referralSource || '—';
    return (
        <div className="flex flex-col gap-8">
            <StepTitle title="Confirm Application" />
            <div className="flex flex-col gap-6">
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
                    <p className="text-muted-foreground">Highlights: {data.highlights || '—'}</p>
                    <p className="text-muted-foreground">Referral: {referralLabel}</p>
                </SummaryCard>
                <SummaryCard title="Gallery Images">
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
                    Thank you for applying to join the Scandio contractor network. We&apos;ll review your application and be in touch within 2 business days.
                </p>
            </div>
            <Button variant="secondary" onClick={() => router.push('/pro/join')}>
                Back To Pro Page
            </Button>
        </div>
    );
}

export default function ProOnboardPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [data, setData] = useState<FormData>(EMPTY_FORM);
    const [radii, setRadii] = useState<ServiceRadius[]>([]);
    const [uploads, setUploads] = useState<UploadedImage[]>([]);
    const [registrationCertificate, setRegistrationCertificate] = useState<RegistrationCertificate | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const [existingDialogOpen, setExistingDialogOpen] = useState(false);
    const [existingApplication, setExistingApplication] = useState<ExistingApplicationRow | null>(null);
    const [existingDialogBusy, setExistingDialogBusy] = useState(false);
    const contentRef = useRef<HTMLElement>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const [footerHeight, setFooterHeight] = useState(0);

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
        if (step !== 4 || services.length > 0) return;
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
        contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [step]);

    const isDirty = useMemo(() => {
        const hasFormData = Object.entries(data).some(([key, value]) => {
            if (key === 'serviceRadiusKm' && value === EMPTY_FORM.serviceRadiusKm) return false;
            if (typeof value === 'string') return value.trim().length > 0;
            if (typeof value === 'boolean') return value;
            return false;
        });
        return hasFormData || radii.length > 0 || uploads.length > 0 || registrationCertificate !== null;
    }, [data, radii.length, uploads.length, registrationCertificate]);

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
            .filter((item) => item.caption !== REGISTRATION_CERT_CAPTION)
            .map((item) => ({
                id: createClientId(),
                path: item.path,
                bucket: item.bucket || 'gallery',
                caption: item.caption || null,
                previewUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${item.bucket || 'gallery'}/${item.path}`,
            }));

        setData({
            ...EMPTY_FORM,
            businessName: app.business_name || '',
            contactPerson: app.contact_name || '',
            emailAddress: app.email || '',
            address: app.address || '',
            phone: app.phone ? formatSaPhoneDisplay(app.phone) : '',
            whatsappAvailable: app.whatsapp_available === true,
            website: app.website || '',
            serviceAreaAddress: nextRadii[0]?.address || app.address || '',
            serviceRadiusKm: nextRadii[0] ? String(nextRadii[0].radiusKm) : EMPTY_FORM.serviceRadiusKm,
            trade: app.trade || '',
            specialisations: app.trade_description || '',
            foundedYear: typeof app.founded_year === 'number' ? String(app.founded_year) : '',
            teamSize: typeof app.team_size === 'number' ? String(app.team_size) : '',
            registrationNumber: app.registration_number || '',
            bio: '',
            certifications: app.certifications || '',
            highlights: app.highlights || '',
            referralSource: app.referral || '',
            referralOther: '',
        });
        setRadii(nextRadii);
        setUploads(nextUploads);
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
        setStep(1);
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

    function canContinue(): boolean {
        if (step === 1) {
            return data.businessName.trim().length >= 2 && data.businessName.trim().length <= 90 && data.contactPerson.trim().length >= 3 && data.contactPerson.trim().length <= 90 && isValidEmail(data.emailAddress);
        }
        if (step === 2) {
            return Boolean(data.address.trim()) && Boolean(toSaE164(data.phone));
        }
        if (step === 3) return radii.length === 1;
        if (step === 4) return Boolean(data.trade.trim() && tokenizeCsv(data.specialisations).length > 0);
        if (step === 5) {
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
        if (step === 6) return uploads.length > 0;
        return true;
    }

    async function handleContinue() {
        if (step === 2) {
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
            ];
            const res = await fetch('/api/providers/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    phone: toSaE164(data.phone),
                    specialisations: tokenizeCsv(data.specialisations).join(', '),
                    certifications: tokenizeCsv(data.certifications).join(', '),
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
                step={1}
                onBack={() => {
                    if (step > 1) {
                        setStep((s) => s - 1);
                        return;
                    }
                    if (isDirty) {
                        setLeaveDialogOpen(true);
                        return;
                    }
                    router.push('/pro/join');
                }}
                centerLabel="Scandio"
            />
            <main
                ref={contentRef}
                className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 pt-20 sm:px-6"
            >
                <div className="flex w-full min-w-0 max-w-xl flex-col gap-8">
                    {step === 1 && <Step1 {...stepProps} />}
                    {step === 2 && <Step2 {...stepProps} onEnsureAddress={ensureAddress} />}
                    {step === 3 && <Step3 {...stepProps} defaultAddress={data.address} radii={radii} onRadiiChange={setRadii} />}
                    {step === 4 && <Step4 {...stepProps} services={services} servicesLoading={servicesLoading} />}
                    {step === 5 && (
                        <Step5
                            {...stepProps}
                            registrationCertificate={registrationCertificate}
                            onRegistrationCertificateChange={setRegistrationCertificate}
                        />
                    )}
                    {step === 6 && <Step6 uploads={uploads} onUploadsChange={setUploads} />}
                    {step === 7 && <Step7 data={data} radii={radii} uploads={uploads} registrationCertificate={registrationCertificate} />}
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
                                router.push('/pro/join');
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
                                    setStep(1);
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
