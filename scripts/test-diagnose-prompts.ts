import assert from 'node:assert/strict';
import { buildSystemInstruction } from '../src/app/api/diagnose/prompts';

const baseInstruction = buildSystemInstruction({
    isFollowUp: false,
    hasUserContext: false,
    userSelectedTrade: null,
    isTextOnlyNoAttachments: false,
    serviceListText: 'Electrical, Plumbing, Painting',
    feedback: undefined,
    providers: [],
    previousDiagnosis: null,
    diagnosisRejected: false,
});

assert(baseInstruction.includes('Allowed service labels (in order): Electrical, Plumbing, Painting'));
assert(baseInstruction.includes('UNRELATED IMAGE RULE'));
assert(baseInstruction.includes('UNSUPPORTED HOME SERVICE RULE'));
assert(baseInstruction.includes('OUTPUT FORMAT:'));
assert(baseInstruction.includes('JSON FORMAT (STRICT):'));

const followUpInstruction = buildSystemInstruction({
    isFollowUp: true,
    hasUserContext: true,
    userSelectedTrade: {
        diagnosis: 'Gate Motor Problem',
        trade: 'Security & Access',
    },
    isTextOnlyNoAttachments: true,
    serviceListText: 'Electrical, Plumbing, Security & Access',
    feedback: 'down',
    providers: [
        {
            name: 'Provider One',
            rating: 4.8,
            ratingCount: 142,
            services: [{ full: 'Gate Motor Repair' }],
            isFavourite: true,
            favouriteReason: 'Highest rating and response time',
        },
    ],
    previousDiagnosis: {
        diagnosis: 'Gate Motor Capacitor Fault',
        trade: 'Security & Access',
        trade_detail: 'Automated Gate Motor',
    },
    diagnosisRejected: true,
});

assert(followUpInstruction.includes('FOLLOW-UP MODE: Keep <thought> to 2–3 short sentences.'));
assert(followUpInstruction.includes('USER CONTEXT: The user first selected "Gate Motor Problem"'));
assert(followUpInstruction.includes('TEXT-ONLY (NO IMAGE): The user has NOT uploaded any image.'));
assert(followUpInstruction.includes('IMPORTANT: The user has indicated that the previous diagnosis was INCORRECT.'));
assert(followUpInstruction.includes('DIAGNOSIS REJECTED (CRITICAL):'));
assert(followUpInstruction.includes("The user already has a diagnosis: \"Gate Motor Capacitor Fault\""));
assert(followUpInstruction.includes("I have already found and displayed the following highly-rated service providers"));

console.log('Prompt composition checks passed.');
