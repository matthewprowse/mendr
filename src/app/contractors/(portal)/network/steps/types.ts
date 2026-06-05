/**
 * Shared types for the contractor onboarding wizard.
 *
 * All step components and the wizard context import from here. Keeping these
 * in a single module avoids circular imports between the context and steps.
 */

export type Service = { id: string; label: string };

export type UploadedImage = {
    id: string;
    path: string;
    bucket: string;
    caption: string | null;
    previewUrl?: string;
};

export type RegistrationCertificate = {
    id: string;
    path: string;
    bucket: string;
    fileName: string;
    previewUrl?: string;
};

export type GalleryDraftItem = {
    id: string;
    file: File;
    caption: string;
    preview: string;
};

export type ContractorType = 'individual' | 'team' | 'enterprise';

export type ServiceRadius = {
    id: string;
    address: string;
    lat: number;
    lng: number;
    radiusKm: number;
};

export type CertificationFile = {
    id: string;
    path: string;
    bucket: string;
    label: string;
    previewUrl?: string;
};

export type KycFile = {
    path: string;
    bucket: string;
    fileName: string;
    previewUrl?: string;
};

export type ExistingApplicationRow = {
    id: string;
    contractor_type?: string | null;
    willingness_to_pay_band?: string | null;
    applicant_google_place_id?: string | null;
    kyc_documents?: {
        idDocument?: { path: string; bucket: string };
        selfie?: { path: string; bucket: string };
    } | null;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    address: string | null;
    phone: string | null;
    whatsapp_available: boolean | null;
    preferred_contact_channel?: string | null;
    website: string | null;
    trade: string | null;
    insurance_cover?: string | null;
    typical_response_time?: string | null;
    pricing_model?: string | null;
    callout_fee?: number | null;
    trade_description: string | null;
    founded_year: number | null;
    registration_number: string | null;
    certifications: string | null;
    highlights: string | null;
    about?: string | null;
    application_images: Array<{ path: string; bucket: string; caption?: string | null }> | null;
    service_areas: Array<{ address?: string; lat?: number; lng?: number; radius_km?: number }> | null;
};

export type FormData = {
    contractorType: ContractorType | '';
    applicantGooglePlaceId: string;
    businessName: string;
    firstName: string;
    surname: string;
    emailAddress: string;
    address: string;
    phone: string;
    whatsappAvailable: boolean;
    preferredContactChannel: string;
    website: string;
    trade: string;
    specialisations: string;
    foundedYear: string;
    registrationNumber: string;
    bio: string;
    certifications: string;
    highlights: string;
    insuranceCover: string;
    typicalResponseTime: string;
    pricingModel: string;
    calloutFee: string;
};

export type PlaceSearchHit = {
    placeId: string;
    name: string;
    address: string;
    phone: string | null;
    website: string | null;
    lat: number | null;
    lng: number | null;
    rating: number | null;
    userRatingCount: number | null;
};

export type PlaceDetailsPayload = {
    placeId: string;
    businessName: string;
    address: string;
    phone: string | null;
    website: string | null;
    lat: number | null;
    lng: number | null;
};

export const EMPTY_FORM: FormData = {
    contractorType: '',
    applicantGooglePlaceId: '',
    businessName: '',
    firstName: '',
    surname: '',
    emailAddress: '',
    address: '',
    phone: '',
    whatsappAvailable: false,
    preferredContactChannel: '',
    website: '',
    trade: '',
    specialisations: '',
    foundedYear: '',
    registrationNumber: '',
    bio: '',
    certifications: '',
    highlights: '',
    insuranceCover: '',
    typicalResponseTime: '',
    pricingModel: '',
    calloutFee: '',
};

export const STEP = {
    CONTRACTOR_TYPE: 1,
    COMPANY_SEARCH: 2,
    BASICS: 3,
    CONTACT: 4,
    SERVICE: 5,
    TRADE: 6,
    PROFILE: 7,
    KYC: 8,
    GALLERY: 9,
    CONFIRM: 10,
} as const;

export const TOTAL_STEPS = STEP.CONFIRM;
export const DEFAULT_SERVICE_RADIUS_KM = 10;

// Bumped to v3 after the willingness-to-pay step was removed and the new
// service-terms fields were added — invalidates stale in-progress sessions.
export const SESSION_KEY = 'scandio-contractor-onboard-v3';

export const REGISTRATION_CERT_CAPTION = 'Registration certificate';
export const KYC_ID_CAPTION = 'KYC: ID document';
export const KYC_SELFIE_CAPTION = 'KYC: Selfie photo';

export const PREFERRED_CONTACT_OPTIONS = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'Email' },
] as const;

export const RESPONSE_TIME_OPTIONS = [
    { value: 'within_1h', label: 'Within an hour' },
    { value: 'within_4h', label: 'Within 4 hours' },
    { value: 'same_day', label: 'Same day' },
    { value: 'within_24h', label: 'Within 24 hours' },
    { value: 'within_48h', label: '1–2 days' },
] as const;

/** Space between the last field and the fixed footer (visual gap above the bar). */
export const FOOTER_SCROLL_GAP_PX = 24;
/** Minimum bottom clearance when footer height is not measured yet (tall phones + safe area). */
export const FOOTER_SCROLL_MIN_PX = 160;

export function certificationCaption(label: string): string {
    return `Certification: ${label.trim()}`;
}

export function maxServiceRadiiForType(t: ContractorType | ''): number {
    if (t === 'individual') return 1;
    if (t === 'team') return 3;
    if (t === 'enterprise') return 6;
    return 1;
}

export function isReservedUploadCaption(c: string | null | undefined): boolean {
    if (!c) return false;
    if (c === REGISTRATION_CERT_CAPTION) return true;
    if (c.startsWith('Certification:')) return true;
    if (c === KYC_ID_CAPTION || c === KYC_SELFIE_CAPTION) return true;
    return false;
}
