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
                'id,image_url,image_urls,diagnosis,initial_image_description,customer_lat,customer_lng,customer_address'
            )
            .eq('id', conversationId)
            .maybeSingle();

        if (error) {
            return null;
        }
        if (!data) return null;

        const row = data as Record<string, unknown>;
        const rawArr = row.image_urls;
        let imageUrls: string[] = [];
        if (Array.isArray(rawArr)) {
            imageUrls = (rawArr as unknown[])
                .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                .map((u) => u.trim());
        }
        if (imageUrls.length === 0 && typeof row.image_url === 'string' && row.image_url.trim()) {
            imageUrls = [row.image_url.trim()];
        }

        return {
            ...(row as ConversationDiagnosisRow),
            imageUrls,
            imageUrl: imageUrls[0] ?? null,
        };
    } catch {
        return null;
    }
}
