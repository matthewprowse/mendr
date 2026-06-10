// Voice transcription via Gemini (@google/genai).
//
// Replaces the dedicated Google Cloud Speech-to-Text path: Gemini's multimodal
// model transcribes the recorded audio directly. This reuses GEMINI_API_KEY
// (the same key the diagnosis pipeline uses) so there is no separate Speech
// service-account to provision, and it tracks Google's current flagship model.
//
// Contract is unchanged: POST multipart/form-data with an `audio` File (plus
// optional `source` and `languageCode`); responds `{ transcript }` on success.
//
// Required env vars: GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
//                    SUPABASE_SERVICE_ROLE_KEY, UPSTASH_REDIS_REST_URL,
//                    UPSTASH_REDIS_REST_TOKEN

import { NextRequest } from 'next/server';
import { getGenAiClient } from '@/lib/ai/ai-client';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/auth/supabase-server';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_LANGUAGE_CODE = 'en-ZA';

// Transcription is a fast, mechanical task — use a quick model with "thinking"
// disabled rather than the (slower, reasoning-heavy) diagnosis model. Override
// via GEMINI_TRANSCRIBE_MODEL if needed.
const TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL ?? 'gemini-2.5-flash';

const LANGUAGE_LABELS: Record<string, string> = {
    'en-ZA': 'South African English',
    'en-US': 'English',
    'en-GB': 'English',
    af: 'Afrikaans',
    'af-ZA': 'Afrikaans',
};

/** Strip codec params so Gemini receives a clean container type. */
function normalizeAudioMime(raw: string): string {
    const base = (raw.split(';')[0] ?? '').trim().toLowerCase();
    return base || 'audio/webm';
}

function transcriptionPrompt(languageCode: string): string {
    const label = LANGUAGE_LABELS[languageCode] ?? 'English';
    return [
        `You are a verbatim transcription engine. Transcribe the attached audio recording to text in ${label}.`,
        'Return ONLY the transcript text — no preamble, no commentary, no quotation marks, no markdown.',
        'Apply light, natural punctuation and capitalisation, but never paraphrase, translate, or summarise.',
        'If the audio contains no intelligible speech, return an empty string and nothing else.',
    ].join(' ');
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'transcribe');
    if (limited) return limited;

    if (!process.env.GEMINI_API_KEY) {
        return Response.json(
            { error: 'Voice transcription is not configured (GEMINI_API_KEY is not set).' },
            { status: 503 },
        );
    }

    const startedAt = Date.now();
    let audioSizeBytes = 0;
    let mimeType = '';
    let transcription = '';
    let status: 'ok' | 'error' = 'error';
    let errorMessage: string | null = null;
    let userId: string | null = null;
    let source: string | null = null;
    let requestLanguageCode = DEFAULT_LANGUAGE_CODE;

    try {
        const formData = await req.formData();
        const audio = formData.get('audio');
        source = String(formData.get('source') || '').trim() || null;
        requestLanguageCode =
            String(formData.get('languageCode') || DEFAULT_LANGUAGE_CODE).trim() || DEFAULT_LANGUAGE_CODE;

        if (!(audio instanceof File)) {
            return Response.json({ error: 'Missing audio file.' }, { status: 400 });
        }

        audioSizeBytes = audio.size;
        mimeType = audio.type || 'application/octet-stream';
        if (audioSizeBytes <= 0) {
            return Response.json({ error: 'Audio recording is empty.' }, { status: 400 });
        }
        if (audioSizeBytes > MAX_AUDIO_BYTES) {
            return Response.json({ error: 'Audio file too large (max 10 MB).' }, { status: 413 });
        }

        const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64');
        const ai = getGenAiClient();
        const result = await ai.models.generateContent({
            model: TRANSCRIBE_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: transcriptionPrompt(requestLanguageCode) },
                        { inlineData: { mimeType: normalizeAudioMime(mimeType), data: base64 } },
                    ],
                },
            ],
            config: {
                // Deterministic, and skip "thinking" — it adds seconds of latency
                // for no transcription-quality gain.
                temperature: 0,
                thinkingConfig: { thinkingBudget: 0 },
            },
        });

        const transcript = (result.text ?? '').trim();
        if (!transcript) {
            errorMessage = 'No speech detected.';
            return Response.json({ error: 'Could not transcribe audio.' }, { status: 422 });
        }

        transcription = transcript;
        status = 'ok';
        return Response.json({ transcript });
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Transcription failed.';
        return Response.json({ error: 'Transcription failed. Please try again.' }, { status: 500 });
    } finally {
        // Best-effort observability — never block or fail the response on logging.
        try {
            const serverClient = await createSupabaseServerClient();
            const { data } = await serverClient.auth.getUser();
            userId = data.user?.id ?? null;
        } catch {
            userId = null;
        }
        try {
            const admin = await createSupabaseAdminClient();
            await admin.from('transcriptions').insert({
                source,
                status,
                transcript: transcription || null,
                error_message: errorMessage,
                audio_mime_type: mimeType || null,
                audio_bytes: audioSizeBytes || null,
                language_code: requestLanguageCode,
                duration_ms: Date.now() - startedAt,
                user_id: userId,
            });
        } catch {
            // ignore logging failures
        }
    }
}
