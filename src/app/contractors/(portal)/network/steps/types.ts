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

export type FormData = {
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

export type PlaceSearchHit = {
    placeId: string;
    name: string;
    address: string;
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

export const STEP = {
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

export const TOTAL_STEPS = STEP.CONFIRM;
export const DEFAULT_SERVICE_RADIUS_KM = 10;

export const SESSION_KEY = 'scandio-contractor-onboard-v2';

export const REGISTRATION_CERT_CAPTION = 'Registration certificate';
export const KYC_ID_CAPTION = 'KYC: ID document';
export const KYC_SELFIE_CAPTION = 'KYC: Selfie photo';

export const WILLINGNESS_OPTIONS = [
    { value: 'under_200', label: 'Under R200 / month' },
    { value: '200_350', label: 'R200 – R350 / month' },
    { value: '350_700', label: 'R350 – R700 / month' },
    { value: '700_plus', label: 'R700+ / month' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
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
