import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/site-url', () => ({
    getSiteUrl: () => 'https://mendr.test',
    getAppOrigin: () => 'https://mendr.test',
}));

import {
    reportUrl,
    formatDiagnosisSummary,
    formatPhotoRequest,
    formatAddressEntryPrompt,
    formatNoAddressPrompt,
    formatAddressNotFound,
    formatFirstContact,
    formatRegistrationGate,
    formatResumePrompt,
    formatHelp,
    formatStartOver,
    formatStop,
    formatHumanEscape,
    formatReprompt,
    formatTopicChangeOffer,
    formatContractorList,
    formatAddressSelection,
    capMessage,
} from '../message-formatter';
import type { DiagnosisData } from '@/features/diagnosis/types';
import type { PendingContractor, PendingAddressOption } from '../types';

describe('reportUrl', () => {
    it('builds a report URL from the site URL', () => {
        expect(reportUrl('abc-123')).toBe('https://mendr.test/report/abc-123');
    });
});

describe('formatDiagnosisSummary fallbacks', () => {
    it('uses a generic headline when title and message are both empty', () => {
        const msgs = formatDiagnosisSummary({} as DiagnosisData, 'd1');
        expect(msgs[0]).toBe('Here is what I found.');
        expect(msgs[1]).toContain('/report/d1');
    });

    it('uses the title alone when message is missing', () => {
        const msgs = formatDiagnosisSummary(
            { diagnosis: 'Broken Spring' } as DiagnosisData,
            'd1',
        );
        expect(msgs[0]).toContain('Broken Spring');
    });
});

describe('formatPhotoRequest', () => {
    it('embeds the requested subject when provided', () => {
        expect(formatPhotoRequest('the valve area')).toContain('the valve area');
    });
    it('uses a generic prompt when no subject is given', () => {
        expect(formatPhotoRequest('')).toContain('closer, sharper photo');
    });
});

describe('static prompts', () => {
    it('formatAddressEntryPrompt mentions the settings URL', () => {
        expect(formatAddressEntryPrompt()).toContain('https://mendr.test/settings/addresses');
    });
    it('formatNoAddressPrompt links to settings and asks for "ready"', () => {
        const out = formatNoAddressPrompt();
        expect(out).toContain('https://mendr.test/settings/addresses');
        expect(out).toContain('ready');
    });
    it('formatAddressNotFound asks for a fuller address', () => {
        expect(formatAddressNotFound()).toContain('fuller address');
    });
    it('formatFirstContact greets and invites a photo', () => {
        expect(formatFirstContact()).toContain('Mendr repair assistant');
    });
    it('formatStartOver invites a fresh start', () => {
        expect(formatStartOver().toLowerCase()).toContain('start fresh');
    });
    it('formatStop mentions re-enabling with START', () => {
        expect(formatStop()).toContain('START');
    });
    it('formatHumanEscape offers to pass to a person', () => {
        expect(formatHumanEscape()).toContain('person');
    });
    it('formatHelp lists the global commands', () => {
        const help = formatHelp();
        expect(help).toContain('help');
        expect(help).toContain('start over');
        expect(help).toContain('stop');
    });
});

describe('formatRegistrationGate', () => {
    it('uses the magic link when one is supplied', () => {
        const out = formatRegistrationGate('https://mendr.test/api/whatsapp/link?token=abc');
        expect(out).toContain('token=abc');
        expect(out).toContain('two taps');
    });
    it('falls back to the register URL when no link is supplied', () => {
        expect(formatRegistrationGate(null)).toContain('https://mendr.test/register');
    });
});

describe('formatResumePrompt', () => {
    it('embeds the last diagnosis title', () => {
        expect(formatResumePrompt('Broken Geyser')).toContain('Broken Geyser');
    });
    it('falls back when title is blank', () => {
        expect(formatResumePrompt('   ')).toContain('your last diagnosis');
    });
});

describe('formatReprompt', () => {
    it('prefixes a gentle apology before the repeated prompt', () => {
        const out = formatReprompt('Reply with a number.');
        expect(out).toContain('did not quite catch that');
        expect(out).toContain('Reply with a number.');
    });
});

describe('formatTopicChangeOffer', () => {
    it('mentions the saved diagnosis when a title is present', () => {
        const out = formatTopicChangeOffer('Broken Spring');
        expect(out).toContain('Broken Spring');
        expect(out).toContain('saved');
    });
    it('omits the saved clause for a blank title', () => {
        const out = formatTopicChangeOffer('');
        expect(out).not.toContain('saved');
        expect(out).toContain('switch');
    });
});

describe('formatContractorList — MORE affordance', () => {
    const contractors: PendingContractor[] = [
        { index: 1, providerId: 'p1', name: 'A', address: null, phone: null, email: null, website: null },
    ];
    it('adds the MORE line when hasMore is true', () => {
        const out = formatContractorList('Plumbing', contractors, { hasMore: true });
        expect(out).toContain('Reply MORE');
    });
    it('omits the MORE line by default and renders name without address', () => {
        const out = formatContractorList('', contractors);
        expect(out).not.toContain('Reply MORE');
        expect(out).toContain('1. A');
        expect(out).toContain('Here are the closest contractors:');
    });
});

describe('formatAddressSelection — label-less row', () => {
    it('renders the address alone when an option has no label', () => {
        const options: PendingAddressOption[] = [
            { index: 1, id: 'a', label: '', address: '5 Long St', lat: 1, lng: 2 },
        ];
        const out = formatAddressSelection(options);
        expect(out).toContain('1. 5 Long St');
    });
});

describe('capMessage — hard ellipsis branch', () => {
    it('hard-truncates with an ellipsis when there is no late sentence boundary', () => {
        const noStops = 'x'.repeat(200);
        const out = capMessage(noStops, 50);
        expect(out.endsWith('…')).toBe(true);
        expect(out.length).toBeLessThanOrEqual(51);
    });
});
