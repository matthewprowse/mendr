export type RolloutStep = {
    phase: string;
    scope: string;
    doneWhen: string;
};

export const mendrRolloutPlan: RolloutStep[] = [
    {
        phase: 'Phase 2 - Marketing shell',
        scope: 'Apply approved tokens and copy to header, homepage hero, and public metadata surfaces.',
        doneWhen: 'Primary marketing pages use Mendr naming and tokenized components with no hardcoded colors.',
    },
    {
        phase: 'Phase 3 - Product flow',
        scope: 'Roll out approved components into start, diagnosis, match, and report routes.',
        doneWhen: 'Core homeowner flow has consistent spacing, states, and trust messaging.',
    },
    {
        phase: 'Phase 4 - Technical migration',
        scope: 'Migrate legacy scandio keys across analytics, storage, and data-source literals with compatibility paths.',
        doneWhen: 'Legacy identifiers are redirected or migrated without data loss.',
    },
];
