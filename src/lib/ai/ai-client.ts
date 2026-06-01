import {
    GoogleGenerativeAI,
    type CachedContent,
    type GenerativeModel,
} from '@google/generative-ai';

/**
 * Main diagnosis pipeline model (Agent 2a classify + Agent 2b prose).
 * Default: gemini-2.5-flash. Override via GEMINI_DIAGNOSIS_MODEL env var
 * (e.g. flip to gemini-3.5-flash for higher diagnostic quality).
 *
 * NOTE: stored as a string (not a literal const) because env-driven overrides
 * are how we switch models without code changes.
 */
export const GEMINI_MODEL_NAME: string =
    process.env.GEMINI_DIAGNOSIS_MODEL || 'gemini-2.5-flash';

/**
 * Agent 3 self-critique runs on a SEPARATE model constant so it stays cheap
 * regardless of which model the main pipeline uses. Override via
 * GEMINI_CRITIQUE_MODEL env var. Defaults to 2.5 Flash.
 */
export const GEMINI_CRITIQUE_MODEL_NAME: string =
    process.env.GEMINI_CRITIQUE_MODEL || 'gemini-2.5-flash';

/**
 * Provider enrichment model. Enrichment is bulk text extraction (bio,
 * specialisations, review summary) — NOT diagnostic reasoning — so it runs on a
 * cheaper model than the diagnosis pipeline. Diagnosis uses gemini-3.5-flash
 * specifically for its thinking capability; enrichment does not need that and
 * disables thinking at the call site (thinkingConfig.thinkingBudget = 0).
 * Override via GEMINI_ENRICHMENT_MODEL env var. Defaults to gemini-2.5-flash.
 */
export const GEMINI_ENRICHMENT_MODEL_NAME: string =
    process.env.GEMINI_ENRICHMENT_MODEL || 'gemini-2.5-flash';

type GeminiModelParams = NonNullable<
    Parameters<GoogleGenerativeAI['getGenerativeModel']>[0]
>;

let cachedClient: GoogleGenerativeAI | null = null;

function getClientFromEnv(): GoogleGenerativeAI {
    if (cachedClient) return cachedClient;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    cachedClient = new GoogleGenerativeAI(apiKey);
    return cachedClient;
}

/**
 * Get a Gemini model configured with the default model name.
 * Uses GEMINI_API_KEY from the environment and memoises the underlying client.
 */
export function getGeminiModel(params?: Omit<GeminiModelParams, 'model'>): GenerativeModel {
    return getClientFromEnv().getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        ...(params ?? {}),
    });
}

/**
 * Get the provider-enrichment model (GEMINI_ENRICHMENT_MODEL_NAME). Kept separate
 * from getGeminiModel so enrichment never inherits the pricier diagnosis model.
 */
export function getGeminiEnrichmentModel(params?: Omit<GeminiModelParams, 'model'>): GenerativeModel {
    return getClientFromEnv().getGenerativeModel({
        model: GEMINI_ENRICHMENT_MODEL_NAME,
        ...(params ?? {}),
    });
}

/** Named model (e.g. Flash Lite for cheap pre-passes). Prefer updating the constant in callers if Google renames tiers. */
export function getGeminiModelNamed(
    model: string,
    params?: Omit<GeminiModelParams, 'model'>,
): GenerativeModel {
    return getClientFromEnv().getGenerativeModel({
        model,
        ...(params ?? {}),
    });
}

/**
 * Build a GenerativeModel that uses a previously-created `CachedContent` as
 * its system instruction. The cached content carries the model name + system
 * prompt; per-call code just passes the dynamic `contents` and
 * generationConfig. Used by the v3.5 classify + prose caching paths to
 * amortise large system prompts at the cached-input rate.
 */
export function getGeminiModelFromCachedContent(
    cached: CachedContent,
    params?: Omit<GeminiModelParams, 'model'>,
): GenerativeModel {
    return getClientFromEnv().getGenerativeModelFromCachedContent(
        cached,
        params,
    );
}

/**
 * Expose the raw Gemini API key for helpers that need to talk to APIs the
 * main SDK doesn't wrap directly (currently: `GoogleAICacheManager` in
 * `gemini-cache-manager.ts`, which lives in `@google/generative-ai/server`
 * and takes the key directly rather than via the genAI client object).
 *
 * Returns null when the env var is missing — callers should fall back
 * rather than throw, since most call sites already handle the not-cached
 * path.
 */
export function getGeminiApiKey(): string | null {
    return process.env.GEMINI_API_KEY ?? null;
}
