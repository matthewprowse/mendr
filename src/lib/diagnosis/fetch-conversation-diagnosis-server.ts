import type { ConversationDiagnosisRow } from '@/lib/diagnosis/diagnoses-api';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

/**
 * Loads the same conversation row as GET `/api/conversations/[id]` for Server Components.
 */
export async function fetchConversationDiagnosisAdmin(
    conversationId: string
): Promise<ConversationDiagnosisRow | null> {
    try {
        const admin = await createSupabaseAdminClient();
        const { data, error } = await admin
            .from('diagnoses')
            .select(
                'id,image_url,diagnosis,initial_image_description,customer_lat,customer_lng,customer_address'
            )
            .eq('id', conversationId)
            .maybeSingle();

        if (error) {
            return null;
        }
        return (data ?? null) as ConversationDiagnosisRow | null;
    } catch {
        return null;
    }
}
