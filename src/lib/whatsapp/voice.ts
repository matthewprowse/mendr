/* eslint-disable no-console */
/**
 * Voice-note transcription for the WhatsApp bot (Phase C, Workstream 7).
 *
 * Reuses the Gemini transcription approach from /api/transcribe but takes raw
 * bytes (already fetched from the WhatsApp CDN) instead of multipart form
 * data. Returns null on any failure — the caller sends a gentle "could not
 * hear that" reply rather than erroring.
 */

import { getGenAiClient } from '@/lib/ai/ai-client';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL ?? 'gemini-2.5-flash';

function normalizeAudioMime(raw: string): string {
    const base = (raw.split(';')[0] ?? '').trim().toLowerCase();
    return base || 'audio/ogg';
}

export async function transcribeVoiceNote(
    bytes: Uint8Array,
    mimeType: string,
): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) return null;
    try {
        const ai = getGenAiClient();
        const result = await ai.models.generateContent({
            model: TRANSCRIBE_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'You are a verbatim transcription engine. Transcribe the attached voice note to text. ' +
                                'The speaker is most likely South African and may mix English with Afrikaans, isiXhosa, or isiZulu. ' +
                                'Return ONLY the transcript text — no preamble, no commentary, no quotation marks. ' +
                                'Apply light natural punctuation. Never paraphrase or translate. ' +
                                'If there is no intelligible speech, return an empty string.',
                        },
                        {
                            inlineData: {
                                mimeType: normalizeAudioMime(mimeType),
                                data: Buffer.from(bytes).toString('base64'),
                            },
                        },
                    ],
                },
            ],
        });
        const text = (result.text ?? '').trim();
        return text || null;
    } catch (e) {
        console.error('[whatsapp/voice] transcription failed', e);
        return null;
    }
}
