import { describe, it, expect } from 'vitest';
import {
    computeProfileCompletenessActions,
    profileCompletenessSteps,
    PROFILE_COMPLETENESS_MAX,
    PROFILE_COMPLETENESS_MIN_PHOTOS,
    PROFILE_COMPLETENESS_MIN_BIO_CHARS,
    type ProfileCompletenessInput,
} from '../profile-completeness-actions';

function makeInput(overrides: Partial<ProfileCompletenessInput> = {}): ProfileCompletenessInput {
    return {
        specialisations: ['Geyser Replacement', 'Leak Repair'],
        imageCount: PROFILE_COMPLETENESS_MIN_PHOTOS + 2,
        bio: 'Family-run plumbing team covering the Southern Suburbs since 2008. Quick callouts and honest pricing.',
        highlights: ['Same-day callouts in Cape Town', '12-month workmanship guarantee'],
        serviceAreas: ['Claremont', 'Newlands'],
        ...overrides,
    };
}

describe('computeProfileCompletenessActions', () => {
    it('returns no actions for a fully populated profile', () => {
        const actions = computeProfileCompletenessActions(makeInput());
        expect(actions).toEqual([]);
    });

    it('returns the photos action when images are missing', () => {
        const actions = computeProfileCompletenessActions(makeInput({ imageCount: 0 }));
        expect(actions.map((a) => a.id)).toEqual(['add_work_photos']);
    });

    it('treats fewer than the minimum photo count as missing', () => {
        const actions = computeProfileCompletenessActions(
            makeInput({ imageCount: PROFILE_COMPLETENESS_MIN_PHOTOS - 1 })
        );
        expect(actions.some((a) => a.id === 'add_work_photos')).toBe(true);
    });

    it('returns the specialisations action when none are set', () => {
        const actions = computeProfileCompletenessActions(makeInput({ specialisations: [] }));
        expect(actions.map((a) => a.id)).toEqual(['add_specialisations']);
    });

    it('flags a short or empty bio', () => {
        const tooShort = 'a'.repeat(PROFILE_COMPLETENESS_MIN_BIO_CHARS - 1);
        const actions = computeProfileCompletenessActions(makeInput({ bio: tooShort }));
        expect(actions.map((a) => a.id)).toEqual(['write_bio']);
    });

    it('returns multiple actions in priority order when several signals are missing', () => {
        const actions = computeProfileCompletenessActions(
            makeInput({
                specialisations: null,
                imageCount: 0,
                bio: '',
                highlights: [],
                serviceAreas: [],
            })
        );
        expect(actions.map((a) => a.id)).toEqual([
            'add_specialisations',
            'add_work_photos',
            'write_bio',
            'add_highlights',
            'add_service_areas',
        ]);
        // Priorities should be strictly increasing.
        const priorities = actions.map((a) => a.priority);
        for (let i = 1; i < priorities.length; i++) {
            expect(priorities[i]).toBeGreaterThan(priorities[i - 1]);
        }
    });

    it('treats whitespace-only entries as empty', () => {
        const actions = computeProfileCompletenessActions(
            makeInput({ specialisations: ['  ', ''], highlights: ['   '] })
        );
        const ids = actions.map((a) => a.id);
        expect(ids).toContain('add_specialisations');
        expect(ids).toContain('add_highlights');
    });

    it('tolerates nullish inputs without throwing', () => {
        const actions = computeProfileCompletenessActions({
            specialisations: null,
            imageCount: null,
            bio: null,
            highlights: undefined,
            serviceAreas: undefined,
        });
        expect(actions.length).toBeGreaterThan(0);
    });
});

describe('profileCompletenessSteps', () => {
    it('clamps negatives to zero', () => {
        expect(profileCompletenessSteps(-5)).toEqual({
            completed: 0,
            total: PROFILE_COMPLETENESS_MAX,
            percent: 0,
        });
    });

    it('clamps above-max scores to the maximum', () => {
        const out = profileCompletenessSteps(PROFILE_COMPLETENESS_MAX + 4);
        expect(out.completed).toBe(PROFILE_COMPLETENESS_MAX);
        expect(out.percent).toBe(100);
    });

    it('returns the correct percent for partial completion', () => {
        const out = profileCompletenessSteps(2);
        expect(out.completed).toBe(2);
        expect(out.total).toBe(PROFILE_COMPLETENESS_MAX);
        expect(out.percent).toBe(Math.round((2 / PROFILE_COMPLETENESS_MAX) * 100));
    });

    it('treats null/undefined as zero', () => {
        expect(profileCompletenessSteps(null).completed).toBe(0);
        expect(profileCompletenessSteps(undefined).completed).toBe(0);
    });
});
