/**
 * Deterministic profile-completeness actions for the contractor account dashboard.
 *
 * The underlying score (`profile_completeness` in `provider_cache`) is computed
 * by the enrichment pipeline as a 0..3 integer. We surface the same signals
 * here as concrete actions a contractor can take to lift their score.
 *
 * The score itself is not directly editable by the contractor — adding
 * specialisations, work photos, a bio and so on causes the enrichment job to
 * raise it the next time it runs. We still tie the action list to the
 * underlying signals so the contractor sees exactly what is missing.
 */

/** Maximum possible profile-completeness score (0..MAX). */
export const PROFILE_COMPLETENESS_MAX = 3;

/** Minimum number of work photos to count as "enough" for the gallery action. */
export const PROFILE_COMPLETENESS_MIN_PHOTOS = 3;

/** Minimum bio length (characters, trimmed) to count as a real bio. */
export const PROFILE_COMPLETENESS_MIN_BIO_CHARS = 40;

export type ProfileCompletenessActionId =
    | 'add_specialisations'
    | 'add_work_photos'
    | 'write_bio'
    | 'add_highlights'
    | 'add_service_areas';

export interface ProfileCompletenessAction {
    id: ProfileCompletenessActionId;
    title: string;
    description: string;
    /** Lower number = higher priority. Stable order for tests/UI. */
    priority: number;
}

export interface ProfileCompletenessInput {
    specialisations: string[] | null | undefined;
    imageCount: number | null | undefined;
    bio: string | null | undefined;
    highlights: string[] | null | undefined;
    serviceAreas: string[] | null | undefined;
}

const ACTION_CATALOG: Record<ProfileCompletenessActionId, Omit<ProfileCompletenessAction, 'id'>> = {
    add_specialisations: {
        title: 'List at least one specialisation',
        description:
            'Tell homeowners what you actually do. Three to eight specific services like "Geyser Replacement" or "DB Board Repairs" — homeowner-facing language, not industry jargon.',
        priority: 1,
    },
    add_work_photos: {
        title: `Add at least ${PROFILE_COMPLETENESS_MIN_PHOTOS} work photos`,
        description:
            'Clear shots of finished jobs are the single biggest factor in homeowner trust. Add captions so reviewers understand what they are looking at.',
        priority: 2,
    },
    write_bio: {
        title: 'Add a business bio',
        description:
            'Two or three plain-English sentences about what you do, where you operate and what sets you apart. Avoid generic phrases.',
        priority: 3,
    },
    add_highlights: {
        title: 'Add a few highlights',
        description:
            'Three to five concrete differentiators — full sentences, no marketing fluff. Things like response time, guarantees, or specialist equipment.',
        priority: 4,
    },
    add_service_areas: {
        title: 'List the areas you cover',
        description:
            'Homeowners filter by location. Add the suburbs or towns you travel to so we can match you accurately.',
        priority: 5,
    },
};

function trimmedNonEmpty(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

function arrayLength(value: readonly string[] | null | undefined): number {
    if (!Array.isArray(value)) return 0;
    return value.filter((entry) => trimmedNonEmpty(entry)).length;
}

/**
 * Compute the ordered list of upgrade actions for a contractor.
 * Returns an empty array when the profile is fully populated.
 */
export function computeProfileCompletenessActions(
    input: ProfileCompletenessInput
): ProfileCompletenessAction[] {
    const actions: ProfileCompletenessAction[] = [];

    if (arrayLength(input.specialisations) === 0) {
        actions.push({ id: 'add_specialisations', ...ACTION_CATALOG.add_specialisations });
    }

    const imageCount = Math.max(
        0,
        Number.isFinite(input.imageCount as number) ? Number(input.imageCount) : 0
    );
    if (imageCount < PROFILE_COMPLETENESS_MIN_PHOTOS) {
        actions.push({ id: 'add_work_photos', ...ACTION_CATALOG.add_work_photos });
    }

    const bio = (input.bio ?? '').trim();
    if (bio.length < PROFILE_COMPLETENESS_MIN_BIO_CHARS) {
        actions.push({ id: 'write_bio', ...ACTION_CATALOG.write_bio });
    }

    if (arrayLength(input.highlights) === 0) {
        actions.push({ id: 'add_highlights', ...ACTION_CATALOG.add_highlights });
    }

    if (arrayLength(input.serviceAreas) === 0) {
        actions.push({ id: 'add_service_areas', ...ACTION_CATALOG.add_service_areas });
    }

    return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * Map a 0..MAX score onto a "steps complete" / "steps total" pair for a
 * progress bar. Score is clamped to the valid range. Steps total is fixed at
 * PROFILE_COMPLETENESS_MAX so the UI is stable across providers.
 */
export function profileCompletenessSteps(score: number | null | undefined): {
    completed: number;
    total: number;
    percent: number;
} {
    const total = PROFILE_COMPLETENESS_MAX;
    const raw = typeof score === 'number' && Number.isFinite(score) ? score : 0;
    const completed = Math.max(0, Math.min(total, Math.trunc(raw)));
    const percent = Math.round((completed / total) * 100);
    return { completed, total, percent };
}
