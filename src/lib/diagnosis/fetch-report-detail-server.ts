import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

export type ReportDetailServerPayload = {
    diagnosis: Record<string, unknown> | null;
    /** Legacy single-image URL. Kept for backward compat; equals imageUrls[0] when populated. */
    image_url: string | null;
    /** Canonical ordered list of image URLs. First entry is the primary view. */
    imageUrls: string[];
    customer_address: string | null;
    customer_lat: number | null;
    customer_lng: number | null;
    initial_image_description: string | null;
};

export type ReportDetailServerResult =
    | { status: 'skipped' }
    | { status: 'ok'; data: ReportDetailServerPayload }
    | { status: 'not_found' }
    | { status: 'error'; message: string };

/**
 * Loads public report data for `/report/[id]` on the server (same fields as the client fetch).
 */
export async function fetchReportDetailOnServer(id: string): Promise<ReportDetailServerResult> {
    let supabase: Awaited<ReturnType<typeof createSupabaseAdminClient>>;
    try {
        supabase = await createSupabaseAdminClient();
    } catch {
        return { status: 'skipped' };
    }

    try {
        let conv: Record<string, unknown> | null = null;

        const { data: d1, error: e1 } = await supabase
            .from('diagnoses')
            .select(
                'diagnosis, image_url, image_urls, customer_address, customer_lat, customer_lng, initial_image_description'
            )
            .eq('id', id)
            .maybeSingle();

        if (e1) {
            const msg =
                e1 && typeof e1 === 'object' && 'message' in e1
                    ? String((e1 as { message: unknown }).message)
                    : '';
            if (
                typeof msg === 'string' &&
                msg.includes('diagnosis') &&
                msg.includes('does not exist')
            ) {
                const { data: d2, error: e2 } = await supabase
                    .from('diagnoses')
                    .select(
                        'diagnosis_json, image_url, image_urls, customer_address, customer_lat, customer_lng, initial_image_description'
                    )
                    .eq('id', id)
                    .maybeSingle();
                if (e2) {
                    return { status: 'error', message: 'Failed to load report.' };
                }
                conv = d2 as Record<string, unknown> | null;
                if (conv && 'diagnosis_json' in conv) {
                    conv.diagnosis = conv.diagnosis_json;
                }
            } else {
                return { status: 'error', message: 'Failed to load report.' };
            }
        } else {
            conv = d1 as Record<string, unknown> | null;
        }

        if (!conv) {
            return { status: 'not_found' };
        }

        const resolvedDiagnosis = conv.diagnosis as Record<string, unknown> | null;

        // Prefer JSONB `image_urls`; fall back to legacy `image_url` for older rows.
        const rawArr = (conv as { image_urls?: unknown }).image_urls;
        let imageUrls: string[] = [];
        if (Array.isArray(rawArr)) {
            imageUrls = (rawArr as unknown[])
                .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
                .map((u) => u.trim());
        }
        const legacyImageUrl =
            typeof conv.image_url === 'string' && conv.image_url.trim() ? conv.image_url.trim() : null;
        if (imageUrls.length === 0 && legacyImageUrl) {
            imageUrls = [legacyImageUrl];
        }

        return {
            status: 'ok',
            data: {
                diagnosis: resolvedDiagnosis,
                image_url: legacyImageUrl ?? imageUrls[0] ?? null,
                imageUrls,
                customer_address: conv.customer_address as string | null,
                customer_lat: conv.customer_lat as number | null,
                customer_lng: conv.customer_lng as number | null,
                initial_image_description:
                    typeof (conv as { initial_image_description?: unknown }).initial_image_description === 'string'
                        ? (conv as { initial_image_description: string }).initial_image_description
                        : null,
            },
        };
    } catch {
        return { status: 'error', message: 'Failed to load report.' };
    }
}
