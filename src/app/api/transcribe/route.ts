import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { SpeechClient, protos } from '@google-cloud/speech';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase-server';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const DEFAULT_LANGUAGE_CODE = 'en-ZA';

let speechClient: SpeechClient | null = null;

function normalizeCredentialsPath(raw: string): string {
    let s = raw.trim();
    if (s.length >= 2) {
        const a = s[0];
        const b = s[s.length - 1];
        if ((a === '"' && b === '"') || (a === "'" && b === "'")) s = s.slice(1, -1);
    }
    return s.trim();
}

/** If credentials are misconfigured locally, return an error message instead of an ENOENT stack in the client. */
function getSpeechCredentialsSetupError(): string | null {
    const inline = process.env.GOOGLE_SPEECH_CREDENTIALS_JSON?.trim();
    if (inline) return null;

    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!raw) return null;

    const pathLike = normalizeCredentialsPath(raw);
    if (pathLike.startsWith('{')) return null;

    try {
        const st = fs.statSync(pathLike);
        if (!st.isFile()) {
            return 'Speech credentials path is not a regular file. Check GOOGLE_APPLICATION_CREDENTIALS in .env.';
        }
    } catch {
        return 'Voice transcription is not set up yet. Download a Google Cloud service account JSON key (Speech-to-Text API enabled) and save it as app/credentials/google-speech-sa.json — or paste the JSON into GOOGLE_SPEECH_CREDENTIALS_JSON in .env.';
    }
    return null;
}

function getSpeechClient(): SpeechClient {
    if (speechClient) return speechClient;

    const inline = process.env.GOOGLE_SPEECH_CREDENTIALS_JSON?.trim();
    if (inline) {
        let credentials: Record<string, unknown>;
        try {
            credentials = JSON.parse(inline) as Record<string, unknown>;
        } catch {
            throw new Error('GOOGLE_SPEECH_CREDENTIALS_JSON must be valid service-account JSON.');
        }
        speechClient = new SpeechClient({ credentials });
        return speechClient;
    }

    speechClient = new SpeechClient();
    return speechClient;
}

function speechErrorUserMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? 'Transcription failed.');
    const lower = raw.toLowerCase();

    if (
        raw.includes('PERMISSION_DENIED') ||
        lower.includes('permission_denied') ||
        (lower.includes('code: 7') && lower.includes('permission'))
    ) {
        return (
            'Google Cloud Speech-to-Text rejected these credentials (PERMISSION_DENIED). ' +
            'In the GCP project that owns this service account JSON: enable the "Cloud Speech-to-Text API" ' +
            '(APIs & Services → Library → Cloud Speech-to-Text API → Enable); ensure billing is linked if Google asks; ' +
            'then IAM → find the exact service-account email → grant role "Speech Client" (roles/speech.client). ' +
            'Wait about two minutes after changes, restart `pnpm dev`, and try again. ' +
            'If Speech never enables cleanly on your current project, create a dedicated GCP project, enable Speech-to-Text there, download a new JSON key, and swap it in.'
        );
    }

    if (lower.includes('billing_disabled') || lower.includes('billing has not been enabled')) {
        return (
            'This Google Cloud project needs an active billing account for Speech-to-Text. ' +
            'Open GCP Console → Billing → link billing to this project.'
        );
    }

    if (
        lower.includes('has not been used in project') ||
        lower.includes('service_disabled') ||
        raw.includes('SERVICE_DISABLED')
    ) {
        return (
            'Cloud Speech-to-Text API is not enabled for this project. ' +
            'GCP Console → APIs & Services → Enable APIs → search "Speech-to-Text" → Enable.'
        );
    }

    if (
        raw.includes('UNAUTHENTICATED') ||
        lower.includes('invalid_grant') ||
        lower.includes('invalid credential')
    ) {
        return 'Invalid or revoked Google credential. Download a fresh JSON key from IAM for the same Cloud project and replace your local file / env.';
    }

    if (
        raw.includes('INVALID_ARGUMENT') &&
        (lower.includes('not supported for language') || lower.includes('requested model'))
    ) {
        return 'Speech model/language mismatch on the server. Retry in a moment; if it persists, update the app — or report this message to support.';
    }

    const maxLen = 400;
    return raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
}

function mapMimeTypeToEncoding(
    mimeType: string
): protos.google.cloud.speech.v1.IRecognitionConfig['encoding'] {
    const lower = mimeType.toLowerCase();
    if (lower.includes('webm')) {
        return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS;
    }
    if (lower.includes('ogg')) {
        return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS;
    }
    return undefined;
}

/**
 * `latest_short` is not valid for every locale (e.g. en-ZA returns INVALID_ARGUMENT).
 * See: https://cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages
 */
function recognitionModelForLanguage(languageCode: string): string {
    const lang = languageCode.trim().toLowerCase().replace('_', '-');
    if (lang === 'en-za') return 'default';
    return 'latest_short';
}

export async function POST(req: NextRequest) {
    const limited = checkRateLimit(req, 'transcribe');
    if (limited) return limited;

    const credentialsError = getSpeechCredentialsSetupError();
    if (credentialsError) {
        return Response.json({ error: credentialsError }, { status: 503 });
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
        const languageCode = String(formData.get('languageCode') || DEFAULT_LANGUAGE_CODE).trim() || DEFAULT_LANGUAGE_CODE;
        requestLanguageCode = languageCode;

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

        const bytes = Buffer.from(await audio.arrayBuffer());
        const recognitionConfig: protos.google.cloud.speech.v1.IRecognitionConfig = {
            languageCode,
            model: recognitionModelForLanguage(languageCode),
            enableAutomaticPunctuation: true,
        };
        const mappedEncoding = mapMimeTypeToEncoding(mimeType);
        if (mappedEncoding !== undefined) recognitionConfig.encoding = mappedEncoding;

        const client = getSpeechClient();
        const [response] = await client.recognize({
            config: recognitionConfig,
            audio: { content: bytes.toString('base64') },
        });

        const transcript = (response.results ?? [])
            .flatMap((result) => result.alternatives ?? [])
            .map((alternative) => alternative.transcript?.trim() ?? '')
            .filter(Boolean)
            .join(' ')
            .trim();

        if (!transcript) {
            return Response.json({ error: 'Could not transcribe audio.' }, { status: 422 });
        }

        transcription = transcript;
        status = 'ok';
        return Response.json({ transcript });
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Transcription failed.';
        const userSafe = speechErrorUserMessage(error);
        return Response.json({ error: userSafe }, { status: 500 });
    } finally {
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
            // Do not fail request completion for logging errors.
        }
    }
}
