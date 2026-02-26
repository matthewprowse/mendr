import { createSupabaseServerClient } from './supabase-server';

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
 * Fetches the active legal document for the given type.
 * Returns null if none exists or Supabase is not configured.
 */
export async function fetchLegalDocument(
    type: LegalDocumentType
): Promise<LegalDocument | null> {
    try {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase
            .from('legal_documents')
            .select('id, type, content, version, created_at')
            .eq('type', type)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(`Error fetching legal document (${type}):`, error);
            return null;
        }
        return data;
    } catch (e) {
        console.warn('Supabase not configured for legal documents:', e);
        return null;
    }
}
