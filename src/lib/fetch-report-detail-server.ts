import { createSupabaseAdminClient } from '@/lib/supabase-server';

export type ReportDetailServerPayload = {
    diagnosis: Record<string, unknown> | null;
    image_url: string | null;
    customer_address: string | null;
    customer_lat: number | null;
    customer_lng: number | null;
    initial_image_description: string | null;
    messages?: {
        content: string;
        role: string;
        attachments?: string[];
        diagnosis?: Record<string, unknown> | null;
    }[];
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
                'diagnosis, image_url, customer_address, customer_lat, customer_lng, initial_image_description'
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
                        'diagnosis_json, image_url, customer_address, customer_lat, customer_lng, initial_image_description'
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

        const { data: msgsRaw } = await supabase
            .from('messages')
            .select('content, role, attachments, diagnosis')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        const msgs = (msgsRaw ?? []) as ReportDetailServerPayload['messages'];

        let resolvedDiagnosis = conv.diagnosis as Record<string, unknown> | null;
        if (!resolvedDiagnosis) {
            const lastWithDiag = [...(msgs ?? [])]
                .reverse()
                .find(
                    (m) =>
                        m.role === 'assistant' &&
                        m.diagnosis &&
                        typeof m.diagnosis === 'object' &&
                        (m.diagnosis as Record<string, unknown>).diagnosis
                );
            if (lastWithDiag?.diagnosis) {
                resolvedDiagnosis = lastWithDiag.diagnosis as Record<string, unknown>;
            }
        }

        return {
            status: 'ok',
            data: {
                diagnosis: resolvedDiagnosis,
                image_url: conv.image_url as string | null,
                customer_address: conv.customer_address as string | null,
                customer_lat: conv.customer_lat as number | null,
                customer_lng: conv.customer_lng as number | null,
                initial_image_description:
                    typeof (conv as { initial_image_description?: unknown }).initial_image_description === 'string'
                        ? (conv as { initial_image_description: string }).initial_image_description
                        : null,
                messages: msgs || [],
            },
        };
    } catch {
        return { status: 'error', message: 'Failed to load report.' };
    }
}
