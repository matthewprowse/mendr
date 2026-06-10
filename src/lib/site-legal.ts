/**
 * Operator / POPIA disclosure fields for legal pages.
 * Set these in production (e.g. Vercel) as NEXT_PUBLIC_* so Terms and Privacy show correctly.
 */
import { getSiteUrl } from '@/lib/site-url';

export type SiteLegalConfig = {
    siteUrl: string;
    operatorLegalName: string;
    legalForm: string;
    physicalAddress: string;
    postalAddress: string;
    /** Terms / general legal contact (ECTA table, Terms footer). */
    legalEmail: string;
    privacyEmail: string;
    informationOfficerName: string;
    informationOfficerEmail: string;
};

/** Shown when NEXT_PUBLIC_* operator fields are not yet configured. */
export const LEGAL_DETAILS_UNPUBLISHED =
    'Not yet published. Use the contact form for operator details.';

export function getSiteLegalConfig(): SiteLegalConfig {
    const siteUrl = getSiteUrl();
    const name = process.env.NEXT_PUBLIC_OPERATOR_LEGAL_NAME?.trim() ?? '';
    const form =
        process.env.NEXT_PUBLIC_OPERATOR_LEGAL_FORM?.trim() ||
        'Private company registered in South Africa';
    const physical = process.env.NEXT_PUBLIC_OPERATOR_PHYSICAL_ADDRESS?.trim() ?? '';
    const postal = process.env.NEXT_PUBLIC_OPERATOR_POSTAL_ADDRESS?.trim() ?? '';
    const legalEmail = process.env.NEXT_PUBLIC_LEGAL_EMAIL?.trim() ?? '';
    const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() ?? '';
    const ioName = process.env.NEXT_PUBLIC_INFORMATION_OFFICER_NAME?.trim() ?? '';
    const ioEmail = process.env.NEXT_PUBLIC_INFORMATION_OFFICER_EMAIL?.trim() ?? '';

    const resolvedPostal = postal || (physical ? 'Same as physical address' : '');
    const resolvedIoEmail = ioEmail || privacyEmail;

    return {
        siteUrl,
        operatorLegalName: name || LEGAL_DETAILS_UNPUBLISHED,
        legalForm: form,
        physicalAddress: physical || LEGAL_DETAILS_UNPUBLISHED,
        postalAddress: resolvedPostal || LEGAL_DETAILS_UNPUBLISHED,
        legalEmail: legalEmail || LEGAL_DETAILS_UNPUBLISHED,
        privacyEmail: privacyEmail || LEGAL_DETAILS_UNPUBLISHED,
        informationOfficerName: ioName || LEGAL_DETAILS_UNPUBLISHED,
        informationOfficerEmail: resolvedIoEmail || LEGAL_DETAILS_UNPUBLISHED,
    };
}
