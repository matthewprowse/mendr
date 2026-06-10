/* eslint-disable no-console */
/**
 * Diagnosis reuse layer (Phase A2).
 *
 * Drives the multi-agent diagnosis pipeline WITHOUT the HTTP route. The route
 * (`/api/diagnose`) is cookie-bound for quota and never persists a user_id, so
 * a server-side caller would collapse to one shared anonymous quota bucket and
 * lose ownership. Instead we:
 *
 *   1. Build Gemini contents with `buildDiagnoseContents`.
 *   2. Call `runDiagnosePipelineNonStreaming`.
 *   3. Parse the `<thought>…</thought><json>…</json>` body the pipeline returns.
 *   4. Persist the diagnosis ourselves with the admin client (setting user_id,
 *      customer_lat/lng/address).
 *   5. Enforce our own daily quota keyed on phone_number / user_id.
 *
 * Shared by the simulator and, later, the Meta webhook.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { SERVICE_LABELS } from '@/lib/services';
import {
    buildSystemInstruction,
    buildProseBaseInstruction,
} from '@/features/diagnosis/prompts/composer';
import {
    buildDiagnoseContents,
    type ContentMessage,
} from '@/app/api/diagnose/contents-builder';
import { runDiagnosePipelineNonStreaming } from '@/app/api/diagnose/pipeline-runner';
import type { DiagnosisData } from '@/features/diagnosis/types';

/** Daily diagnosis cap per phone number / user for the WhatsApp funnel. */
export const WHATSAPP_DAILY_QUOTA = 15;

export interface RunDiagnosisInput {
    /** Phone number (quota key + persisted homeowner_whatsapp later). */
    phoneNumber: string;
    /** Owning user, when the number is linked to a Mendr account. */
    userId: string | null;
    /** Free-text describing the problem (optional when images present). */
    text?: string;
    /** Up to 4 data-URI images. */
    images?: string[];
    /**
     * Conversation history for refinement turns. Each entry is { role, content }
     * with role 'user' | 'assistant'. When present the pipeline treats this as a
     * follow-up rather than a first message.
     */
    history?: Array<{ role: 'user' | 'assistant'; content?: string }>;
    /** When refining, the previous parsed diagnosis (for prompt context). */
    previousDiagnosis?: Partial<DiagnosisData> | null;
}

export interface RunDiagnosisResult {
    /** New diagnoses.id row created for this turn. */
    diagnosisId: string;
    /** Parsed diagnosis JSON. */
    data: DiagnosisData;
}

export type RunDiagnosisOutcome =
    | { ok: true; result: RunDiagnosisResult }
    | { ok: false; reason: 'quota_exceeded' }
    | { ok: false; reason: 'error'; message: string };

/**
 * Parse the pipeline's `<thought>...</thought><json>...</json>` response body
 * into a DiagnosisData object. The pipeline always returns this shape via
 * `buildCompatibleResponseText`.
 */
export function parsePipelineResponse(responseText: string): DiagnosisData {
    const jsonMatch = responseText.match(/<json>([\s\S]*?)<\/json>/);
    const thoughtMatch = responseText.match(/<thought>([\s\S]*?)<\/thought>/);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : '';
    if (!jsonMatch) {
        throw new Error('Pipeline response missing <json> block');
    }
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    return {
        ...(parsed as unknown as DiagnosisData),
        thinking:
            typeof parsed.thinking === 'string'
                ? (parsed.thinking as string)
                : thought,
    };
}

async function getServiceList(): Promise<string[]> {
    try {
        const list = await getServiceCatalogLabelsCached();
        if (Array.isArray(list) && list.length > 0) return list;
    } catch {
        // fall through to static labels
    }
    return [...SERVICE_LABELS];
}

/**
 * Count how many diagnoses this phone / user has run in the last 24h. Keyed on
 * user_id when available, otherwise on the diagnosis rows we tag via metadata.
 *
 * Persisted diagnoses created by the bot carry a `whatsapp_phone` marker inside
 * `diagnosis.message`? No — instead we store the phone on the session and count
 * the session's own diagnoses by user_id. For guest/unlinked numbers we fall
 * back to counting rows whose user_id is null AND whose customer_address was set
 * by this phone — which is unreliable, so for the unregistered path the bot
 * gates on registration before ever reaching here.
 */
async function isOverDailyQuota(
    userId: string | null,
): Promise<boolean> {
    if (!userId) return false; // unlinked numbers never reach diagnosis (registration gate)
    const admin = await createSupabaseAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
        .from('diagnoses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);
    if (error) {
        console.error('[whatsapp/diagnosis] quota count error:', error);
        return false; // never block on a counting failure
    }
    return (count ?? 0) >= WHATSAPP_DAILY_QUOTA;
}

/**
 * Run a diagnosis end-to-end and persist it. Returns the new diagnosis id and
 * parsed data, or a structured failure.
 */
export async function runWhatsappDiagnosis(
    input: RunDiagnosisInput,
): Promise<RunDiagnosisOutcome> {
    if (await isOverDailyQuota(input.userId)) {
        return { ok: false, reason: 'quota_exceeded' };
    }

    try {
        const images = (input.images ?? []).filter(
            (s) => typeof s === 'string' && s.trim().length > 0,
        );
        const text = (input.text ?? '').trim();
        const hasImages = images.length > 0;
        const isTextOnly = !hasImages;
        const history = Array.isArray(input.history) ? input.history : [];

        const serviceList = await getServiceList();
        const serviceListText = serviceList.join(', ');

        const promptContext = {
            isFollowUp: history.length > 0,
            hasUserContext: false as const,
            userSelectedTrade: null,
            isTextOnlyNoAttachments: isTextOnly,
            serviceListText,
            feedback: undefined,
            providers: undefined,
            previousDiagnosis: input.previousDiagnosis ?? undefined,
            diagnosisRejected: false,
        };
        const systemInstruction = buildSystemInstruction(promptContext);
        const proseBaseInstruction = buildProseBaseInstruction(promptContext);
        const instructionPrefix = `${systemInstruction.trim()}\n\n`;

        // First image is the primary `image`, the rest are attachments.
        const primaryImage = hasImages ? images[0] : null;
        const attachmentImages = hasImages ? images.slice(1) : [];

        const { contents, imagesAfterTier } = await buildDiagnoseContents({
            image: primaryImage,
            attachmentImages,
            textQuery: text,
            history,
            initialImageDescription: null,
            instructionPrefix,
            isTextOnly,
            isProviderHydration: false,
            hasUserContext: false,
            userSelectedTrade: null,
        });

        const responseShape = {
            previousDiagnosis: input.previousDiagnosis ?? null,
            diagnosisRejected: false,
            history,
            initialImageDescription: null,
            textQuery: text,
            imageCountAfterTier: imagesAfterTier,
            hasImage: Boolean(primaryImage),
            attachmentCount: attachmentImages.length,
        };

        const pipelineResult = await runDiagnosePipelineNonStreaming({
            contents: contents as ContentMessage[],
            quickThoughtContents: [],
            serviceListText,
            serviceList,
            proseBaseInstruction,
            isProviderHydration: false,
            imagesAfterTier,
            timings: {},
            pipelineStartedAt: Date.now(),
            responseShape,
            userId: input.userId,
        });

        const data = parsePipelineResponse(pipelineResult.responseText);

        // Persist the diagnosis ourselves with the admin client.
        const admin = await createSupabaseAdminClient();
        const { data: inserted, error: insertError } = await admin
            .from('diagnoses')
            .insert({
                title:
                    typeof data.diagnosis === 'string' ? data.diagnosis.slice(0, 200) : null,
                diagnosis: data,
                user_id: input.userId,
                // NOTE: requires_clarification and clarification_question_count are
                // GENERATED ALWAYS columns on `diagnoses` (derived from the diagnosis
                // JSONB). They must NOT be set explicitly or Postgres rejects the
                // insert with "cannot insert a non-DEFAULT value". The generated
                // column reads the value out of the `diagnosis` blob above.
                trade_detail:
                    typeof data.trade_detail === 'string' ? data.trade_detail : null,
                device: 'whatsapp',
            })
            .select('id')
            .single();

        if (insertError || !inserted) {
            return {
                ok: false,
                reason: 'error',
                message: insertError?.message ?? 'Failed to persist diagnosis',
            };
        }

        return {
            ok: true,
            result: { diagnosisId: inserted.id as string, data },
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown diagnosis error';
        console.error('[whatsapp/diagnosis] runWhatsappDiagnosis error:', e);
        return { ok: false, reason: 'error', message };
    }
}

/**
 * Attach the chosen address coordinates to an existing diagnosis. Contractor
 * matching keys off the diagnosis coordinates, so they must be copied on before
 * the provider search runs.
 */
export async function setDiagnosisLocation(
    diagnosisId: string,
    loc: { lat: number | null; lng: number | null; address: string | null },
): Promise<void> {
    const admin = await createSupabaseAdminClient();
    const { error } = await admin
        .from('diagnoses')
        .update({
            customer_lat: loc.lat,
            customer_lng: loc.lng,
            customer_address: loc.address,
        })
        .eq('id', diagnosisId);
    if (error) {
        console.error('[whatsapp/diagnosis] setDiagnosisLocation error:', error);
    }
}
