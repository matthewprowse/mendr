/**
 * Phase 3 of the Diagnosis Architecture Hardening Plan.
 *
 * Captures every prompt + response from Gemini in the `ai_call_log` table so
 * we can reproduce, diff, and audit AI behaviour after the fact. Powers the
 * Phase 5 prompt-restructure regression check and the Phase 9 conversation
 * detail dashboard view.
 *
 * Logging is fire-and-forget — a failure here never surfaces to the caller.
 * Pattern mirrors `ai-cost-logger.ts`.
 *
 * Images are NOT stored. They live in object storage already and re-embedding
 * them in a SQL row would balloon table size for no diagnostic gain. Prompt
 * text + textual user content + response JSON is enough to reproduce a call
 * deterministically given the image URLs.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { after } from 'next/server';
import type { Content as GeminiContent } from '@google/genai';

export type AiCallAgentId = '2a' | '2b' | '2c' | '3-critique';

export interface AiCallLogInput {
    conversationId: string | null | undefined;
    agentId: AiCallAgentId;
    /** Full assembled prompt text — system instruction + user contents textified. */
    promptText: string;
    /** Optional prompt version string. Typically DIAGNOSE_PROMPT_VERSION. */
    promptVersion?: string | null;
    modelId: string;
    temperature?: number | null;
    topP?: number | null;
    topK?: number | null;
    /** Raw response string returned by Gemini, before parsing. */
    responseText?: string | null;
    /** Parsed structured output. Null when JSON parsing failed. */
    responseJson?: unknown;
    /** Wall-clock duration of the Gemini call, in ms. */
    latencyMs?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    /** Non-null implies the call failed; responseText/responseJson may be null. */
    error?: string | null;
    /**
     * URLs of the images the model saw on this call. Bytes are never inlined
     * (privacy + storage); URLs are sufficient to replay the call later as long
     * as Supabase storage retention exceeds ai_call_log's 90-day window.
     */
    imageUrls?: string[] | null;
}

/**
 * Shared context bag accepted by every agent (classify/prose/reasoning/critique).
 * Used to tag the ai_call_log row with conversation + user + the URLs of any
 * images sent on the call.
 */
export interface AgentCallCtx {
    userId?: string | null;
    conversationId?: string | null;
    imageUrls?: string[] | null;
}

/**
 * Serialise a Gemini `Content[]` array into a plain-text representation suitable
 * for storage. Images and other non-text parts become URL or marker strings —
 * the actual binary data is NEVER copied into the log.
 *
 * Exported because every agent's callsite needs to produce this text consistently
 * before passing it to `logAiCall`.
 */
export function textifyGeminiContents(
    systemInstruction: string,
    contents: GeminiContent[],
): string {
    const out: string[] = [];
    out.push('=== SYSTEM INSTRUCTION ===');
    out.push(systemInstruction);
    out.push('');

    for (const [i, c] of contents.entries()) {
        out.push(`=== CONTENT[${i}] role=${c.role} ===`);
        for (const part of c.parts ?? []) {
            const p = part as unknown as Record<string, unknown>;
            if (typeof p.text === 'string') {
                out.push(p.text);
            } else if (p.inlineData && typeof p.inlineData === 'object') {
                const mime = (p.inlineData as { mimeType?: string }).mimeType ?? 'unknown';
                out.push(`[INLINE ${mime} — bytes not logged]`);
            } else if (p.fileData && typeof p.fileData === 'object') {
                const fd = p.fileData as { mimeType?: string; fileUri?: string };
                out.push(`[FILE ${fd.mimeType ?? 'unknown'} ${fd.fileUri ?? ''}]`);
            } else {
                out.push('[unknown part type]');
            }
        }
        out.push('');
    }

    return out.join('\n').trim();
}

/**
 * Write one `ai_call_log` row. Never throws.
 *
 * Use `void logAiCall({...})` at the callsite so it never blocks the response.
 */
async function insertAiCallRow(input: AiCallLogInput): Promise<void> {
    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('ai_call_log').insert({
            conversation_id: input.conversationId ?? null,
            agent_id:        input.agentId,
            prompt_text:     input.promptText,
            prompt_version:  input.promptVersion ?? null,
            model_id:        input.modelId,
            temperature:     input.temperature ?? null,
            top_p:           input.topP ?? null,
            top_k:           input.topK ?? null,
            response_text:   input.responseText ?? null,
            response_json:   input.responseJson ?? null,
            latency_ms:      input.latencyMs ?? null,
            input_tokens:    input.inputTokens ?? null,
            output_tokens:   input.outputTokens ?? null,
            error:           input.error ?? null,
            image_urls:      input.imageUrls ?? [],
        });

        if (error) {
            console.warn('[ai-call-logger] insert error', error.message);
        }
    } catch (e) {
        console.warn('[ai-call-logger] threw', e instanceof Error ? e.message : e);
    }
}

/**
 * Schedule a write to ai_call_log via Next 16's `after()` so the insert is
 * guaranteed to complete after the response is sent. Callers fire this
 * synchronously immediately after their Gemini call — no `void`, no `await`.
 *
 * Falls back to a plain `void` promise if `after()` is unavailable in the
 * current execution scope (e.g. unit tests or scripts).
 */
export function logAiCall(input: AiCallLogInput): void {
    if (process.env.AI_CALL_LOG_DISABLED === '1') return;
    try {
        after(() => insertAiCallRow(input));
    } catch {
        // Outside a request-scoped Next context — fall back to fire-and-forget.
        void insertAiCallRow(input);
    }
}
