export type LegalDocumentType =
    | 'privacy_policy'
    | 'terms_of_service'
    | 'pro_terms_of_service';

export type LegalDocument = {
    id: string;
    type: LegalDocumentType;
    content: string;
    version: string;
    created_at: string;
};

/**
 * Temporary stub: returns null for all legal documents.
 * This is used to verify that the dev server launches correctly.
 */
export async function fetchLegalDocument(
    _type: LegalDocumentType
): Promise<LegalDocument | null> {
    return null;
}
