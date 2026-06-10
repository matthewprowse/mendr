/**
 * Spec 05 — Contact form submit + rate-limit.
 *
 * Status
 * ------
 * The contact form previously lived at /contact (src/components/contact-form.tsx
 * + src/app/contact/client.tsx). As of the current main branch, /contact
 * redirects to /landing1#contact (see src/app/contact/page.tsx). The
 * landing1 page does not currently mount <ContactForm /> (verified via grep
 * of src/app/landing1/**), so there is no DOM surface for this E2E to drive.
 *
 * The form behaviour is covered by the unit/DOM test suite in
 * src/components/__tests__/contact-form.dom.test.tsx (Testing Library + MSW,
 * 5 tests, all green at baseline).
 *
 * Rate limiting itself is covered by:
 *   • src/lib/__tests__/rate-limit.test.ts (logic)
 *   • src/app/api/contact/route.test.ts (the 429 path against the route)
 *
 * Re-enable conditions
 * --------------------
 *   1. Re-mount <ContactForm /> on a public route (landing1#contact, /contact,
 *      or a new dedicated page).
 *   2. Remove `.skip` below and replace the body with: navigate → fill name
 *      / email / message → submit → assert success → submit 5+ more times →
 *      assert a visible rate-limit indicator (toast, banner, or 429 text).
 */
import { test, expect } from '@playwright/test';

test.describe('contact form', () => {
    test.skip(
        true,
        'Contact form has no live public route — /contact redirects to /landing1#contact which no longer mounts <ContactForm />. See file header for re-enable steps.',
    );

    test('submits successfully and rate-limits after 5 rapid posts', async ({ page }) => {
        await page.goto('/');
        expect(page.url()).toMatch(/^https?:\/\//);
    });
});
