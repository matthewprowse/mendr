import type { PromptProvider } from '@/features/diagnosis/prompts/types';

function numOrZero(v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/** First meaningful segment of an address for suburb/area hints (not full street). */
function areaHintFromAddress(address: unknown): string | undefined {
    if (typeof address !== 'string') return undefined;
    const t = address.trim();
    if (!t) return undefined;
    const first = t.split(',')[0]?.trim() ?? '';
    if (first.length < 3) return undefined;
    return first.length > 48 ? `${first.slice(0, 45)}…` : first;
}

/**
 * Normalise client provider payloads (chat UI, diagnosis page) for diagnose prompts.
 */
export function normalizeProvidersForPrompt(input: unknown, max = 12): PromptProvider[] | undefined {
    if (!Array.isArray(input) || input.length === 0) return undefined;
    const out: PromptProvider[] = [];
    for (const raw of input.slice(0, max)) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        if (!name) continue;
        const rating = numOrZero(o.rating);
        const ratingCount = numOrZero(o.ratingCount ?? o.rating_count);
        const specs = Array.isArray(o.specialisations)
            ? o.specialisations.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            : Array.isArray(o.specializations)
              ? o.specializations.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
              : undefined;
        const distanceRaw = o.distanceText ?? o.distance_text;
        const distanceText =
            typeof distanceRaw === 'string' && distanceRaw.trim() ? distanceRaw.trim() : undefined;
        const areaHint = areaHintFromAddress(o.address) ?? areaHintFromAddress(o.formatted_address);
        out.push({
            name,
            rating,
            ratingCount,
            ...(specs && specs.length ? { specialisations: specs } : {}),
            ...(typeof o.isFavourite === 'boolean' && o.isFavourite ? { isFavourite: true } : {}),
            ...(typeof o.favouriteReason === 'string' && o.favouriteReason.trim()
                ? { favouriteReason: o.favouriteReason.trim() }
                : {}),
            ...(distanceText ? { distanceText } : {}),
            ...(areaHint ? { areaHint } : {}),
        });
    }
    return out.length > 0 ? out : undefined;
}
