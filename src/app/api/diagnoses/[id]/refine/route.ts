// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    GEMINI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import type { Content as GeminiContent } from '@google/genai';
import { GEMINI_MODEL_NAME } from '@/lib/ai/ai-diagnosis-backend';
import { logAiEvent, logPipelineStep } from '@/lib/ai/ai-logging';
import { logIfDiagnosisJsonShapeUnexpected } from '@/features/diagnosis/diagnosis-json-validate';
import { DIAGNOSE_PROMPT_VERSION } from '@/features/diagnosis/prompts/prompt-version';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getServiceCatalogLabelsCached } from '@/lib/service-catalog-server';
import { buildSystemInstruction, buildProseBaseInstruction } from '@/features/diagnosis/prompts/composer';
import { runClassification } from '@/features/diagnosis/agent-classify';
import { runProseGeneration, normaliseProse } from '@/features/diagnosis/agent-prose';
import { toHeadlineStyle, stripFillerSentenceStarts } from '@/lib/ai/prompt-utils';
import { SERVICE_LABELS } from '@/lib/services';
import { parseDiagnosisFromModelResponse } from '@/lib/diagnosis/parse-diagnosis-from-model-response';
import type { DiagnosisData } from '@/features/diagnosis/types';
import { computeStructuralConfidence } from '@/lib/diagnosis/structural-confidence';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DIAGNOSE_IMAGES = 4;
const MAX_DIAGNOSE_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_IMAGE_ORIGINS = [process.env.NEXT_PUBLIC_SUPABASE_URL].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
);

function isAllowedImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_IMAGE_ORIGINS.some((origin) => parsed.origin === new URL(origin).origin);
    } catch {
        return false;
    }
}

interface ContentPart {
    text?: string;
    inlineData?: { data: string; mimeType: string };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    if (typeof Buffer !== 'undefined') return Buffer.from(buffer).toString('base64');
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    // eslint-disable-next-line no-undef
    return btoa(binary);
}

async function imageStringToInlineData(img: string): Promise<ContentPart | null> {
    if (img.startsWith('data:')) {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(';')[0].split(':')[1];
        if (!base64Data || !mimeType) return null;
        const approxBytes = Math.floor((base64Data.length * 3) / 4);
        if (approxBytes > MAX_DIAGNOSE_IMAGE_BYTES) return null;
        return { inlineData: { data: base64Data, mimeType } };
    }
    if (img.startsWith('http') && !isAllowedImageUrl(img)) return null;
    try {
        const res = await fetch(img);
        if (!res.ok) return null;
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > MAX_DIAGNOSE_IMAGE_BYTES) return null;
        const base64Data = arrayBufferToBase64(bytes);
        return { inlineData: { data: base64Data, mimeType } };
    } catch {
        return null;
    }
}

type RouteContext = { params: Promise<{ id: string }> };

interface RefineBody {
    additionalText?: string;
    additionalImageUrls?: string[];
    trigger?: 'user' | 'photo_request';
}

export async function POST(req: NextRequest, context: RouteContext) {
    const startedAt = Date.now();
    const limited = await checkRateLimit(req, 'refineDiagnosis');
    if (limited) return limited;

    const { id } = await context.params;
    const conversationId = String(id || '').trim();
    if (!conversationId || !UUID_RE.test(conversationId)) {
        return NextResponse.json({ error: 'Invalid diagnosis id' }, { status: 400 });
    }

    let body: RefineBody;
    try {
        body = (await req.json()) as RefineBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const additionalText =
        typeof body.additionalText === 'string' ? body.additionalText.trim() : '';
    const additionalImageUrlsRaw = Array.isArray(body.additionalImageUrls)
        ? body.additionalImageUrls
              .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
              .map((u) => u.trim())
        : [];
    const trigger: 'user' | 'photo_request' =
        body.trigger === 'photo_request' ? 'photo_request' : 'user';

    if (additionalText.length === 0 && additionalImageUrlsRaw.length === 0) {
        return NextResponse.json(
            { error: 'Refinement requires either text or at least one new image.' },
            { status: 400 },
        );
    }
    if (additionalText.length > 2000) {
        return NextResponse.json(
            { error: 'Additional text too long. Maximum 2000 characters.' },
            { status: 400 },
        );
    }
    for (const u of additionalImageUrlsRaw) {
        if (u.startsWith('http') && !isAllowedImageUrl(u)) {
            return NextResponse.json({ error: 'Invalid image URL.' }, { status: 400 });
        }
    }

    // ── Auth: must own the row, or row must be guest-owned (user_id null) ──────
    // Mirrors the pattern in /api/diagnoses/[id] (admin client for the read +
    // ownership check based on the session user when available).
    const admin = await createSupabaseAdminClient();

    let sessionUserId: string | null = null;
    try {
        const sb = await createSupabaseServerClient();
        const {
            data: { user },
        } = await sb.auth.getUser();
        sessionUserId = user?.id ?? null;
    } catch {
        sessionUserId = null;
    }

    const { data: row, error: rowErr } = await admin
        .from('diagnoses')
        .select(
            'id, user_id, image_url, image_urls, diagnosis, initial_image_description, customer_address, image_refinement_log',
        )
        .eq('id', conversationId)
        .maybeSingle();

    if (rowErr) {
        return NextResponse.json({ error: rowErr.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: 'Diagnosis not found.' }, { status: 404 });
    }

    const ownerId =
        typeof (row as { user_id?: unknown }).user_id === 'string'
            ? ((row as { user_id: string }).user_id || null)
            : null;
    if (ownerId && ownerId !== sessionUserId) {
        return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    }

    // ── Combine images: new FIRST, original SECOND ─────────────────────────────
    // The user has just shown new evidence — Gemini's first-image attention
    // weight should sit on those photos.
    const existingArr = (row as { image_urls?: unknown }).image_urls;
    const existingImages: string[] = Array.isArray(existingArr)
        ? (existingArr as unknown[])
              .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
              .map((u) => u.trim())
        : (() => {
              const legacy = (row as { image_url?: unknown }).image_url;
              return typeof legacy === 'string' && legacy.trim() ? [legacy.trim()] : [];
          })();

    const merged = [...additionalImageUrlsRaw, ...existingImages];
    let droppedOldImages = 0;
    if (merged.length > MAX_DIAGNOSE_IMAGES) {
        droppedOldImages = merged.length - MAX_DIAGNOSE_IMAGES;
        console.warn(
            `[diagnose/refine] merged ${merged.length} images for ${conversationId}; capping at ${MAX_DIAGNOSE_IMAGES} — dropping ${droppedOldImages} OLDEST from back.`,
        );
    }
    const finalImageUrls = merged.slice(0, MAX_DIAGNOSE_IMAGES);

    // ── Build Gemini inline parts in the same order as finalImageUrls ──────────
    // (new images first → original images after).
    const imageParts: ContentPart[] = [];
    for (const url of finalImageUrls) {
        const part = await imageStringToInlineData(url);
        if (part) imageParts.push(part);
    }

    // ── Service catalog (same fallback chain as /api/diagnose) ─────────────────
    let serviceList = await getServiceCatalogLabelsCached();
    if (serviceList.length === 0) serviceList = [...SERVICE_LABELS];
    const serviceListText = serviceList.join(', ');

    // ── Build prior-diagnosis context for the prompt ──────────────────────────
    const priorDiag =
        (row as { diagnosis?: unknown }).diagnosis &&
        typeof (row as { diagnosis?: unknown }).diagnosis === 'object'
            ? ((row as { diagnosis: Record<string, unknown> }).diagnosis)
            : null;

    const priorAsPromptShape = priorDiag
        ? {
              diagnosis:
                  typeof priorDiag.diagnosis === 'string' ? priorDiag.diagnosis : undefined,
              trade: typeof priorDiag.trade === 'string' ? priorDiag.trade : undefined,
              trade_detail:
                  typeof priorDiag.trade_detail === 'string' ? priorDiag.trade_detail : undefined,
              message: typeof priorDiag.message === 'string' ? priorDiag.message : undefined,
              action_required:
                  typeof priorDiag.action_required === 'string'
                      ? priorDiag.action_required
                      : undefined,
          }
        : null;

    const priorPhotoRequest =
        priorDiag && typeof priorDiag.photo_request === 'string'
            ? priorDiag.photo_request.trim()
            : '';

    const promptContext = {
        isFollowUp: true,
        hasUserContext: false,
        userSelectedTrade: null,
        isTextOnlyNoAttachments: false,
        serviceListText,
        feedback: undefined,
        providers: undefined,
        previousDiagnosis: priorAsPromptShape,
        diagnosisRejected: false,
        isRefinementWithNewImages: additionalImageUrlsRaw.length > 0,
    } as const;

    const systemInstruction = buildSystemInstruction(promptContext);
    const proseBaseInstruction = buildProseBaseInstruction(promptContext);

    // ── Build the conversation contents Gemini sees ────────────────────────────
    // History echo: a synthetic prior assistant turn describing the existing
    // diagnosis so the model has full context (Agent 2a/2b both read this).
    const priorAssistantText = priorDiag
        ? [
              priorDiag.diagnosis ? `Prior diagnosis: ${String(priorDiag.diagnosis)}.` : null,
              priorDiag.trade ? `Trade: ${String(priorDiag.trade)}.` : null,
              priorDiag.trade_detail ? `Specialty: ${String(priorDiag.trade_detail)}.` : null,
              priorDiag.message ? String(priorDiag.message) : null,
              priorPhotoRequest ? `Photo I asked for: ${priorPhotoRequest}` : null,
          ]
              .filter((s): s is string => Boolean(s && s.trim()))
              .join('\n\n')
        : '';

    // CRITICAL: include the homeowner's original description so the model retains
    // full context. Without this, the refinement turn only sees the new text +
    // images and may drift to "unserviced" because it lost the original framing.
    const originalDescription =
        typeof (row as { initial_image_description?: unknown }).initial_image_description === 'string'
            ? ((row as { initial_image_description: string }).initial_image_description).trim()
            : '';

    const refinementUserText = (() => {
        const lines: string[] = [];
        if (originalDescription) {
            lines.push(`ORIGINAL DESCRIPTION (do NOT discard): ${originalDescription}`);
        }
        if (additionalImageUrlsRaw.length > 0) {
            lines.push(
                `REFINEMENT: I've added ${additionalImageUrlsRaw.length} new photo${
                    additionalImageUrlsRaw.length === 1 ? '' : 's'
                }. They are FIRST in this message; my older photo${
                    existingImages.length === 1 ? '' : 's'
                } follow${existingImages.length === 1 ? 's' : ''}. Please re-assess with the new images weighted most heavily. Do NOT mark this diagnosis as unserviced or rejected unless the new information genuinely changes what trade is needed.`,
            );
        }
        if (additionalText) {
            lines.push(`ADDITIONAL CONTEXT FROM HOMEOWNER: ${additionalText}`);
        }
        return lines.join('\n\n');
    })();

    const contents: GeminiContent[] = [];
    if (priorAssistantText) {
        contents.push({
            role: 'model' as const,
            parts: [{ text: priorAssistantText }],
        } as unknown as GeminiContent);
    }
    contents.push({
        role: 'user' as const,
        parts: [
            ...imageParts,
            { text: `${systemInstruction.trim()}\n\n${refinementUserText.trim()}` },
        ],
    } as unknown as GeminiContent);

    // ── Run two-agent pipeline ─────────────────────────────────────────────────
    const pipelineStart = Date.now();
    const classification = await runClassification(
        contents,
        serviceListText,
        serviceList,
        { userId: sessionUserId, conversationId },
    );
    logPipelineStep({
        stepName: 'agent-classify',
        status: classification.requestFailed ? 'error' : 'ok',
        durationMs: Date.now() - pipelineStart,
        conversationId,
        userId: sessionUserId,
        modelName: GEMINI_MODEL_NAME,
        meta: { source: 'refine' },
    });

    const proseStart = Date.now();
    const rawProse = await runProseGeneration({
        contents,
        classification,
        baseSystemInstruction: proseBaseInstruction,
        imageCount: imageParts.length,
        ctx: { userId: sessionUserId, conversationId },
    });
    const prose = normaliseProse(rawProse);
    logPipelineStep({
        stepName: 'agent-prose',
        status: prose.requestFailed ? 'error' : 'ok',
        durationMs: Date.now() - proseStart,
        conversationId,
        userId: sessionUserId,
        modelName: GEMINI_MODEL_NAME,
        meta: { source: 'refine' },
    });

    // ── Build the canonical compatible response string and parse to DiagnosisData ──
    // Threshold matches the Phase 1 bump in agent-prose (was 50 → 200) so
    // refinement and initial diagnosis share the same minimum reasoning depth.
    const ensuredThought =
        prose.thought && prose.thought.trim().length >= 200
            ? prose.thought.trim()
            : (prose.thought && prose.thought.trim().length >= 50
                ? prose.thought.trim()
                : 'Photo is not clear enough for a confident diagnosis. Uploading a sharper or closer image of the problem area will help.');

    const jsonBody = {
        thought: ensuredThought,
        thinking: ensuredThought,
        diagnosis: prose.diagnosis,
        estimated_diagnosis_sentence: prose.estimated_diagnosis_sentence,
        message: prose.message,
        action_required: prose.action_required,
        image_descriptions: prose.image_descriptions ?? [],
        image_thought_breakdown: Array.isArray(prose.image_descriptions)
            ? prose.image_descriptions
                  .filter((x) => typeof x === 'string')
                  .map((x) => String(x).trim())
                  .filter(Boolean)
            : [],
        clarification_questions: Array.isArray(prose.clarification_questions)
            ? prose.clarification_questions.filter(
                  (q) => typeof q === 'string' && q.trim().length > 0,
              )
            : [],
        contractor_checklist: Array.isArray(prose.contractor_checklist)
            ? prose.contractor_checklist.filter(
                  (s) => typeof s === 'string' && s.trim().length > 0,
              )
            : [],
        homeowner_prep: typeof prose.homeowner_prep === 'string' ? prose.homeowner_prep : '',
        diy_verification: typeof prose.diy_verification === 'string' ? prose.diy_verification : '',
        photo_request: typeof prose.photo_request === 'string' ? prose.photo_request : '',
        confidence_drivers: Array.isArray(prose.confidence_drivers)
            ? prose.confidence_drivers.filter((s) => typeof s === 'string' && s.trim().length > 0)
            : [],
        trade: classification.trade,
        trade_detail: classification.trade_detail,
        confidence: classification.confidence,
        rejected: classification.rejected,
        requires_clarification: classification.requires_clarification,
        unserviced: classification.unserviced,
        refetch_providers: classification.refetch_providers,
        unsupported_reason: classification.unsupported_reason ?? '',
        subcategory_id: classification.subcategory_id,
        failed_component:
            typeof classification.failed_component === 'string' ? classification.failed_component : '',
        cascading_damage:
            typeof classification.cascading_damage === 'string' ? classification.cascading_damage : '',
        prompt_version: DIAGNOSE_PROMPT_VERSION,
        ai_model: GEMINI_MODEL_NAME,
        pipeline: 'v2-classify-prose-refine',
    };
    logIfDiagnosisJsonShapeUnexpected(jsonBody);

    const wrapped = `<thought>${ensuredThought}</thought>\n<json>${JSON.stringify(jsonBody)}</json>`;
    const parsed: DiagnosisData | null = parseDiagnosisFromModelResponse(wrapped);
    if (!parsed) {
        return NextResponse.json(
            { error: 'Could not parse refined diagnosis.' },
            { status: 500 },
        );
    }
    // ── Phase 4: recompute structural confidence on the refined diagnosis ─────
    // Combine the original description with the new refinement text so longer
    // user input over multiple rounds is correctly credited.
    const descriptionForStructural = [originalDescription, additionalText]
        .filter((s) => s.length > 0)
        .join(' ');
    const structural = computeStructuralConfidence({
        classification: {
            ...classification,
            // Use the parsed (post-override) trade so rejected/unserviced flow is captured.
            trade: parsed.trade,
            subcategory_id: parsed.subcategory_id ?? classification.subcategory_id,
            rejected: Boolean(parsed.rejected),
            unserviced: Boolean(parsed.unserviced),
            requires_clarification: Boolean(parsed.requires_clarification),
            failed_component:
                typeof parsed.failed_component === 'string'
                    ? parsed.failed_component
                    : classification.failed_component,
        },
        imageCount: finalImageUrls.length,
        descriptionText: descriptionForStructural,
        failedComponent: parsed.failed_component,
    });

    const finalDiagnosis: DiagnosisData = {
        ...parsed,
        diagnosis: toHeadlineStyle(parsed.diagnosis),
        action_required: stripFillerSentenceStarts(parsed.action_required ?? ''),
        structural_confidence: {
            score: structural.score,
            signals: structural.signals,
        },
    };

    // ── Append to image_refinement_log (append-only) ───────────────────────────
    const existingLogArr = (row as { image_refinement_log?: unknown }).image_refinement_log;
    const existingLog: unknown[] = Array.isArray(existingLogArr) ? existingLogArr : [];
    const newLogEntry = {
        added_at: new Date().toISOString(),
        count_before: existingImages.length,
        count_after: finalImageUrls.length,
        new_images_added: additionalImageUrlsRaw.length,
        dropped_oldest: droppedOldImages,
        trigger,
        had_additional_text: additionalText.length > 0,
    };
    const updatedLog = [...existingLog, newLogEntry];

    // ── Persist ────────────────────────────────────────────────────────────────
    const patch: Record<string, unknown> = {
        diagnosis: finalDiagnosis,
        image_urls: finalImageUrls,
        // Legacy mirror always equals image_urls[0] per Phase 2 invariant.
        image_url: finalImageUrls[0] ?? null,
        image_refinement_log: updatedLog,
        updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await admin
        .from('diagnoses')
        .update(patch)
        .eq('id', conversationId);

    if (updateErr) {
        console.error('[diagnose/refine] persist failed', updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const durationMs = Date.now() - startedAt;
    logAiEvent({
        endpoint: 'diagnose',
        status: 'ok',
        durationMs,
        meta: {
            source: 'refine',
            promptVersion: DIAGNOSE_PROMPT_VERSION,
            model: GEMINI_MODEL_NAME,
            conversationId,
            newImages: additionalImageUrlsRaw.length,
            totalImages: finalImageUrls.length,
            droppedOldImages,
            trigger,
            hadAdditionalText: additionalText.length > 0,
        },
    });

    return NextResponse.json({
        diagnosis: finalDiagnosis,
        imageUrls: finalImageUrls,
    });
}
