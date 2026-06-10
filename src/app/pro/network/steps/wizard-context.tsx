'use client';

/**
 * Wizard context for the contractor onboarding flow.
 *
 * Hoists every piece of state previously held inside the monolithic
 * `client.tsx` into a single provider so each Step component can pull
 * exactly what it needs without prop-drilling.
 *
 * The provider owns:
 *   • form data (the long FormData record + radii + uploads + KYC + certs)
 *   • current step + navigation (goNext / goBack / goToStep)
 *   • per-step validation status (canContinue, radiiStepValid)
 *   • cross-step derived state (maxRadii, isDirty, services catalogue)
 *   • session-storage persistence
 *   • the submit handler + submitted/submitting flags
 *   • the leave/existing dialog modals (state only — the chrome renders them)
 *
 * The provider intentionally exposes a wide surface; the alternative
 * (multiple narrow contexts) would force most steps to consume two or three.
 * For an 11-step wizard with this much cross-step coupling, one wide
 * context is the simpler shape.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchActiveServiceCatalogClient } from '@/lib/services-catalog';
import { geocodeApi } from '@/features/match/api/client';
import { createClientId } from '@/lib/client-random-id';
import { isValidSaRegistrationNumber } from '../sa-registration';
import {
    DEFAULT_SERVICE_RADIUS_KM,
    EMPTY_FORM,
    KYC_ID_CAPTION,
    KYC_SELFIE_CAPTION,
    REGISTRATION_CERT_CAPTION,
    SESSION_KEY,
    STEP,
    TOTAL_STEPS,
    certificationCaption,
    isReservedUploadCaption,
    maxServiceRadiiForType,
    type CertificationFile,
    type ExistingApplicationRow,
    type FormData,
    type KycFile,
    type PlaceDetailsPayload,
    type RegistrationCertificate,
    type Service,
    type ServiceRadius,
    type UploadedImage,
} from './types';
import {
    formatSaPhoneDisplay,
    isValidEmail,
    normalizeWebsiteToHttps,
    shortenSaAddress,
    toSaE164,
    toTitleCaseWords,
    tokenizeCsv,
} from './utils';

type WizardContextValue = {
    // Step nav
    step: number;
    goNext: () => Promise<void>;
    goBack: () => void;
    goToStep: (n: number) => void;
    canContinue: () => boolean;

    // Form data
    data: FormData;
    patch: (update: Partial<FormData>) => void;

    // Radii
    radii: ServiceRadius[];
    setRadii: (next: ServiceRadius[]) => void;
    patchRadiusRow: (id: string, patchRow: Partial<ServiceRadius>) => void;
    maxRadii: number;

    // Uploads + KYC + certs
    uploads: UploadedImage[];
    setUploads: (next: UploadedImage[]) => void;
    registrationCertificate: RegistrationCertificate | null;
    setRegistrationCertificate: (next: RegistrationCertificate | null) => void;
    certificationFiles: CertificationFile[];
    setCertificationFiles: (next: CertificationFile[]) => void;
    kycId: KycFile | null;
    setKycId: (next: KycFile | null) => void;
    kycSelfie: KycFile | null;
    setKycSelfie: (next: KycFile | null) => void;

    // Catalogue
    services: Service[];
    servicesLoading: boolean;

    // Submission
    submitting: boolean;
    submitted: boolean;

    // Cross-step helpers
    isDirty: boolean;
    ensureAddress: () => Promise<boolean>;
    applyPlacePrefill: (details: PlaceDetailsPayload) => void;
    hydrateFromExisting: (app: ExistingApplicationRow) => void;

    // Dialogs (chrome owns the JSX; context owns the state)
    leaveDialogOpen: boolean;
    setLeaveDialogOpen: (open: boolean) => void;
    existingDialogOpen: boolean;
    setExistingDialogOpen: (open: boolean) => void;
    existingApplication: ExistingApplicationRow | null;
    setExistingApplication: (app: ExistingApplicationRow | null) => void;
    existingDialogBusy: boolean;
    deleteExistingApplication: () => Promise<void>;
    resetWizard: () => void;

    // Footer measurement (drives in-flow scroll clearance)
    footerRef: React.MutableRefObject<HTMLDivElement | null>;
    footerHeight: number;
    contentRef: React.RefObject<HTMLElement | null>;
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
    const ctx = useContext(WizardContext);
    if (!ctx) {
        throw new Error('useWizard must be used within a WizardProvider');
    }
    return ctx;
}

export function WizardProvider({ children }: { children: ReactNode }) {
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

    // Clamp radii when the contractor type narrows the allowed count.
    useEffect(() => {
        const max = maxServiceRadiiForType(data.contractorType);
        setRadii((prev) => (prev.length > max ? prev.slice(0, max) : prev));
    }, [data.contractorType]);

    const patchRadiusRow = useCallback((id: string, patchRow: Partial<ServiceRadius>) => {
        setRadii((prev) => prev.map((r) => (r.id === id ? { ...r, ...patchRow } : r)));
    }, []);

    // Measure footer so we can leave scroll clearance for the last field.
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

    // Hydrate from sessionStorage on first mount.
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

    // Persist to sessionStorage on every change after hydration.
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
    }, [
        sessionLoaded,
        submitted,
        step,
        data,
        radii,
        uploads,
        registrationCertificate,
        certificationFiles,
        kycId,
        kycSelfie,
    ]);

    // Lazy-load the trade catalogue when we arrive at the TRADE step.
    // The `services` DB table was removed — this resolves to the canonical
    // SERVICE_LABELS catalogue (via /api/service-catalog with a static fallback).
    useEffect(() => {
        if (step !== STEP.TRADE || services.length > 0) return;
        setServicesLoading(true);
        fetchActiveServiceCatalogClient()
            .then((labels) => {
                setServices(labels.map((label) => ({ id: label, label })));
                setServicesLoading(false);
            })
            .catch(() => setServicesLoading(false));
    }, [step, services.length]);

    // Always scroll to the top when the step changes.
    useEffect(() => {
        contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [step]);

    const isDirty = useMemo(() => {
        const hasFormData = Object.entries(data).some(([, value]) => {
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
        patch({ address: shortenSaAddress(geo.address) });
        return true;
    }, [data.address, patch]);

    const applyPlacePrefill = useCallback(
        (details: PlaceDetailsPayload) => {
            patch({
                businessName: toTitleCaseWords(details.businessName),
                address: shortenSaAddress(details.address),
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
                        address: shortenSaAddress(details.address),
                        lat: details.lat,
                        lng: details.lng,
                        radiusKm: DEFAULT_SERVICE_RADIUS_KM,
                    },
                ]);
            }
        },
        [patch]
    );

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

        const certRows = imageRows.filter(
            (i) => typeof i.caption === 'string' && i.caption.startsWith('Certification:')
        );
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
            applicantGooglePlaceId: app.applicant_google_place_id || '',
            businessName: app.business_name || '',
            firstName: (app.contact_name || '').trim().split(/\s+/)[0] || '',
            surname: (app.contact_name || '').trim().split(/\s+/).slice(1).join(' ') || '',
            emailAddress: app.email || '',
            address: app.address || '',
            phone: app.phone ? formatSaPhoneDisplay(app.phone) : '',
            whatsappAvailable: app.whatsapp_available === true,
            preferredContactChannel: app.preferred_contact_channel || '',
            website: app.website || '',
            trade: app.trade || '',
            specialisations: app.trade_description || '',
            foundedYear: typeof app.founded_year === 'number' ? String(app.founded_year) : '',
            registrationNumber: app.registration_number || '',
            bio: typeof app.about === 'string' ? app.about : '',
            certifications: app.certifications || '',
            highlights: app.highlights || '',
            insuranceCover: app.insurance_cover || '',
            typicalResponseTime: app.typical_response_time || '',
            pricingModel: app.pricing_model || '',
            calloutFee: typeof app.callout_fee === 'number' ? String(app.callout_fee) : '',
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
            const json = (await res.json().catch(() => null)) as {
                application?: ExistingApplicationRow | null;
            } | null;
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

    function radiiStepValid(): boolean {
        if (radii.length < 1 || radii.length > maxRadii) return false;
        return radii.every(
            (r) =>
                r.lat !== 0 &&
                r.lng !== 0 &&
                r.address.trim().length > 0 &&
                r.radiusKm >= 1
        );
    }

    function canContinue(): boolean {
        if (step === STEP.CONTRACTOR_TYPE) {
            return (
                data.contractorType === 'individual' ||
                data.contractorType === 'team' ||
                data.contractorType === 'enterprise'
            );
        }
        if (step === STEP.COMPANY_SEARCH) return true;
        if (step === STEP.BASICS) {
            return (
                data.businessName.trim().length >= 2 &&
                data.businessName.trim().length <= 90 &&
                data.firstName.trim().length > 0 &&
                data.surname.trim().length > 0 &&
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
            const regPartial =
                data.registrationNumber.trim().length > 0 && !isValidSaRegistrationNumber(data.registrationNumber);
            if (regPartial) return false;
            if (isValidSaRegistrationNumber(data.registrationNumber) && !registrationCertificate) return false;
            return (
                Number.isInteger(year) &&
                year >= 1900 &&
                year <= new Date().getFullYear() &&
                data.bio.trim().length > 0 &&
                tokenizeCsv(data.certifications).length > 0 &&
                data.highlights.trim().length > 0
            );
        }
        if (step === STEP.KYC) return true;
        if (step === STEP.GALLERY) {
            if (data.contractorType === 'individual') return true;
            return uploads.length > 0;
        }
        return true;
    }

    async function submitApplication() {
        setSubmitting(true);
        try {
            const uploadsPayload = [
                ...uploads.map(({ path, bucket, caption }) => ({ path, bucket, caption })),
                ...(registrationCertificate
                    ? [
                          {
                              path: registrationCertificate.path,
                              bucket: registrationCertificate.bucket,
                              caption: REGISTRATION_CERT_CAPTION,
                          },
                      ]
                    : []),
                ...certificationFiles.map((c) => ({
                    path: c.path,
                    bucket: c.bucket,
                    caption: certificationCaption(c.label),
                })),
                ...(kycId
                    ? [{ path: kycId.path, bucket: kycId.bucket, caption: KYC_ID_CAPTION }]
                    : []),
                ...(kycSelfie
                    ? [{ path: kycSelfie.path, bucket: kycSelfie.bucket, caption: KYC_SELFIE_CAPTION }]
                    : []),
            ];
            const res = await fetch('/api/providers/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contractorType: data.contractorType,
                    applicantGooglePlaceId: data.applicantGooglePlaceId.trim() || undefined,
                    kycDocuments: {
                        ...(kycId ? { idDocument: { path: kycId.path, bucket: kycId.bucket } } : {}),
                        ...(kycSelfie ? { selfie: { path: kycSelfie.path, bucket: kycSelfie.bucket } } : {}),
                    },
                    businessName: data.businessName,
                    contactPerson: `${data.firstName} ${data.surname}`.trim(),
                    emailAddress: data.emailAddress,
                    address: data.address,
                    phone: toSaE164(data.phone),
                    whatsappAvailable: data.whatsappAvailable,
                    preferredContactChannel: data.preferredContactChannel,
                    website: data.website,
                    trade: data.trade,
                    specialisations: tokenizeCsv(data.specialisations).join(', '),
                    foundedYear: data.foundedYear,
                    registrationNumber: data.registrationNumber,
                    certifications: tokenizeCsv(data.certifications).join(', '),
                    bio: data.bio,
                    highlights: data.highlights,
                    insuranceCover: data.insuranceCover,
                    typicalResponseTime: data.typicalResponseTime,
                    pricingModel: data.pricingModel,
                    calloutFee: data.calloutFee,
                    serviceAreas: radii.map((r) => `${r.address} (${r.radiusKm}km)`).join(', '),
                    serviceAreaRadii: radii,
                    uploads: uploadsPayload,
                    clientApplicationId: createClientId(),
                }),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => null);
                toast.error(
                    (json as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.'
                );
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

    const goNext = useCallback(async () => {
        if (step === STEP.CONTACT) {
            const validAddress = await ensureAddress();
            if (!validAddress) return;
        }
        if (step < TOTAL_STEPS) {
            setStep((s) => s + 1);
            return;
        }
        await submitApplication();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, ensureAddress, data, radii, uploads, registrationCertificate, certificationFiles, kycId, kycSelfie]);

    const goBack = useCallback(() => {
        if (step > 1) {
            setStep((s) => s - 1);
            return;
        }
        if (isDirty) {
            setLeaveDialogOpen(true);
            return;
        }
        router.push('/pro');
    }, [step, isDirty, router]);

    const goToStep = useCallback((n: number) => {
        if (n < 1 || n > TOTAL_STEPS) return;
        setStep(n);
    }, []);

    const resetWizard = useCallback(() => {
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
    }, []);

    const deleteExistingApplication = useCallback(async () => {
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
            resetWizard();
            setExistingDialogOpen(false);
        } finally {
            setExistingDialogBusy(false);
        }
    }, [existingApplication, resetWizard]);

    const value: WizardContextValue = {
        step,
        goNext,
        goBack,
        goToStep,
        canContinue,
        data,
        patch,
        radii,
        setRadii,
        patchRadiusRow,
        maxRadii,
        uploads,
        setUploads,
        registrationCertificate,
        setRegistrationCertificate,
        certificationFiles,
        setCertificationFiles,
        kycId,
        setKycId,
        kycSelfie,
        setKycSelfie,
        services,
        servicesLoading,
        submitting,
        submitted,
        isDirty,
        ensureAddress,
        applyPlacePrefill,
        hydrateFromExisting,
        leaveDialogOpen,
        setLeaveDialogOpen,
        existingDialogOpen,
        setExistingDialogOpen,
        existingApplication,
        setExistingApplication,
        existingDialogBusy,
        deleteExistingApplication,
        resetWizard,
        footerRef,
        footerHeight,
        contentRef,
    };

    return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}
