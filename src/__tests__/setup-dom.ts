/**
 * Setup file for the jsdom-environment Vitest tests.
 *
 * The file runs for ALL test files but only attaches jsdom-side machinery
 * when the current environment is jsdom (Node-env tests still get a no-op
 * import). This is because `setupFiles` is global across the run; we use
 * `environmentMatchGlobs` to pick per-file environments.
 *
 *  • Extends `expect` with jest-dom matchers (`toBeInTheDocument`, etc.).
 *  • Boots a shared MSW server with default handlers, resets between tests,
 *    and tears it down once the file run completes.
 *  • Polyfills `URL.createObjectURL`/`revokeObjectURL` for components that
 *    preview uploaded files (some forms call these on mount).
 */

import { afterAll, afterEach, beforeAll } from 'vitest';

const IS_JSDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

if (IS_JSDOM) {
    // jest-dom matchers (toBeInTheDocument, etc.) — registered for vitest's expect.
    await import('@testing-library/jest-dom/vitest');

    const { server } = await import('./msw/server');

    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'warn' });

        // jsdom doesn't implement these — components that revoke object URLs
        // (e.g. file-upload previews) otherwise throw.
        if (typeof URL.createObjectURL !== 'function') {
            // @ts-expect-error — jsdom polyfill
            URL.createObjectURL = () => 'blob:test';
        }
        if (typeof URL.revokeObjectURL !== 'function') {
            // @ts-expect-error — jsdom polyfill
            URL.revokeObjectURL = () => undefined;
        }

        // Radix primitives (Switch, Select, Dialog) measure their trigger
        // via ResizeObserver. jsdom doesn't ship it, so we stub a no-op.
        if (typeof globalThis.ResizeObserver === 'undefined') {
            // @ts-expect-error — minimal stub matches the constructor signature
            globalThis.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };
        }

        // Pointer-capture APIs are referenced by Radix when a touch/pointer
        // event reaches the trigger — jsdom doesn't implement them.
        if (
            typeof globalThis.HTMLElement !== 'undefined' &&
            !globalThis.HTMLElement.prototype.hasPointerCapture
        ) {
            globalThis.HTMLElement.prototype.hasPointerCapture = () => false;
            globalThis.HTMLElement.prototype.releasePointerCapture = () => {};
            globalThis.HTMLElement.prototype.setPointerCapture = () => {};
        }

        // scrollIntoView is referenced by Radix Select when an item is focused.
        if (
            typeof globalThis.HTMLElement !== 'undefined' &&
            !globalThis.HTMLElement.prototype.scrollIntoView
        ) {
            globalThis.HTMLElement.prototype.scrollIntoView = () => {};
        }

        // jsdom doesn't implement Element.scrollTo or window.scrollTo —
        // long-form pages call this on step change.
        if (
            typeof globalThis.HTMLElement !== 'undefined' &&
            !globalThis.HTMLElement.prototype.scrollTo
        ) {
            // @ts-expect-error — jsdom polyfill
            globalThis.HTMLElement.prototype.scrollTo = () => {};
        }
        // jsdom ships a stub `window.scrollTo` that throws "Not implemented".
        // Replace it with a no-op unconditionally.
        if (typeof window !== 'undefined') {
            Object.defineProperty(window, 'scrollTo', {
                configurable: true,
                writable: true,
                value: () => {},
            });
        }
    });

    afterEach(() => {
        server.resetHandlers();
    });

    afterAll(() => {
        server.close();
    });
}
