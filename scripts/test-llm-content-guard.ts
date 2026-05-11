/**
 * Unit checks for the LLM content guard used by provider enrichment.
 * Run: npm run test:llm-content-guard
 */

import assert from 'node:assert/strict';
import {
    maskUnsafeContent,
    validateLlmContentRecord,
    validateLlmContentSafe,
} from '../src/lib/llm-content-guard';

function passes(label: string, text: string) {
    const verdict = validateLlmContentSafe(text);
    assert.equal(verdict.ok, true, `expected pass: ${label}\n  text: ${JSON.stringify(text)}`);
}

function failsWith(label: string, text: string, reason: 'css' | 'html' | 'structural' | 'low_signal') {
    const verdict = validateLlmContentSafe(text);
    assert.equal(verdict.ok, false, `expected fail: ${label}`);
    if (!verdict.ok) {
        assert.equal(verdict.reason, reason, `wrong reason for ${label}: got ${verdict.reason}`);
        assert.ok(typeof verdict.sample === 'string' && verdict.sample.length > 0, `sample empty: ${label}`);
    }
}

function main() {
    passes(
        'clean prose',
        'CapeFlow Plumbing handles emergency leaks across the southern suburbs. Family run since 2009 with three full-time technicians.'
    );

    passes('empty', '');
    passes('whitespace only', '   \n  ');
    passes('with normal punctuation', 'Same-day callouts. Transparent quoting. Friendly team.');

    failsWith('inline html tag', 'Family run <strong>since 2009</strong> with three technicians.', 'html');
    failsWith('html attribute', 'Visit our team href="https://example.com" today.', 'html');
    failsWith('html entity', 'Family &amp; team since 2009.', 'html');
    failsWith('css selector block', '.hero { font-family: Arial; } We fix leaks.', 'css');
    failsWith('css property line', 'font-family: Arial, sans-serif; padding: 12px; color: #16120E;', 'css');
    failsWith('media query', '@media (max-width: 768px) { display: none; }', 'css');
    failsWith('rgb function', 'background: rgb(255, 255, 255); experienced team.', 'css');
    failsWith('px units', 'Margin spacing of 12px around the team photo.', 'css');
    failsWith('rem units', 'We span 4rem of the cape.', 'css');
    failsWith('!important leakage', 'Our service is reliable !important and tidy.', 'css');
    failsWith('base64 image', 'About us data:image/png;base64,iVBORw0KGgo... etc.', 'css');
    failsWith('code fence', '```\nabout: family run since 2009\n```', 'structural');
    failsWith('json blob', '{"about":"family run since 2009"}', 'structural');
    failsWith('escape sequence leak', 'Family run since 2009.\\n\\nThree technicians.', 'structural');
    failsWith('all caps banner', 'COOKIES POLICY ACCEPTANCE NOTICE\nFamily run since 2009.', 'structural');
    failsWith(
        'low-signal scrape residue',
        Array.from({ length: 12 }, () => 'div li ul section header footer').join(' '),
        'low_signal'
    );

    const failures = validateLlmContentRecord({
        about_business: 'Family run since 2009. Same-day callouts.',
        past_work: '<div class="card">Replaced geyser</div>',
        bio: '',
        customer_review_summary: 'Punctual and tidy.',
    });
    assert.deepEqual(Object.keys(failures), ['past_work']);
    assert.equal(failures.past_work?.reason, 'html');

    assert.equal(
        maskUnsafeContent('Family run since 2009.<br/> Three full-time <span>technicians</span>.'),
        'Family run since 2009. Three full-time technicians.'
    );
    const masked = maskUnsafeContent('Margin 12px and font-family: Arial; matter little to customers.');
    assert.ok(!/12px/.test(masked), 'mask did not strip 12px');
    assert.ok(!/font-family/i.test(masked), 'mask did not strip font-family');
    assert.ok(/Margin/.test(masked) && /customers/.test(masked), 'mask should preserve safe surrounding text');

    console.log('llm-content-guard tests OK');
}

main();
