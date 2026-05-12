/**
 * Sanity checks for safeRedirectPath.
 * Run: npx tsx scripts/test-safe-redirect.ts
 */
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../src/lib/safe-redirect';

// Same-origin paths pass through unchanged.
assert.equal(safeRedirectPath('/admin/providers', '/admin'), '/admin/providers');
assert.equal(safeRedirectPath('/foo', '/'), '/foo');
assert.equal(safeRedirectPath('/foo?bar=1#baz', '/'), '/foo?bar=1#baz');

// Empty / missing / wrong types → fallback.
assert.equal(safeRedirectPath('', '/admin'), '/admin');
assert.equal(safeRedirectPath('   ', '/admin'), '/admin');
assert.equal(safeRedirectPath(null, '/admin'), '/admin');
assert.equal(safeRedirectPath(undefined, '/admin'), '/admin');
assert.equal(safeRedirectPath(42 as unknown, '/admin'), '/admin');

// Protocol-relative is rejected.
assert.equal(safeRedirectPath('//example.com', '/admin'), '/admin');
assert.equal(safeRedirectPath('//example.com/admin', '/admin'), '/admin');

// Scheme-bearing URLs are rejected.
assert.equal(safeRedirectPath('https://example.com', '/admin'), '/admin');
assert.equal(safeRedirectPath('http://example.com/admin', '/admin'), '/admin');
assert.equal(safeRedirectPath('javascript:alert(1)', '/admin'), '/admin');
assert.equal(safeRedirectPath('data:text/html,foo', '/admin'), '/admin');
assert.equal(safeRedirectPath('mailto:foo@bar.com', '/admin'), '/admin');

// Backslash variants are rejected (browsers normalise `\` to `/`).
assert.equal(safeRedirectPath('\\\\example.com', '/admin'), '/admin');
assert.equal(safeRedirectPath('/\\example.com', '/admin'), '/admin');
assert.equal(safeRedirectPath('\\evil', '/admin'), '/admin');

// Inputs that don't start with `/` are rejected.
assert.equal(safeRedirectPath('admin/providers', '/admin'), '/admin');
assert.equal(safeRedirectPath('about:blank', '/admin'), '/admin');

// Bad fallback also normalises to `/`.
assert.equal(safeRedirectPath('//example.com', 'evil'), '/');

// allowedPathPrefixes — segment-boundary aware.
const adminOnly = { allowedPathPrefixes: ['/admin'] } as const;
assert.equal(safeRedirectPath('/admin', '/admin', adminOnly), '/admin');
assert.equal(safeRedirectPath('/admin/providers', '/admin', adminOnly), '/admin/providers');
assert.equal(safeRedirectPath('/admin/providers?ok=1', '/admin', adminOnly), '/admin/providers?ok=1');
assert.equal(safeRedirectPath('/administration/secret', '/admin', adminOnly), '/admin');
assert.equal(safeRedirectPath('/other', '/admin', adminOnly), '/admin');
assert.equal(safeRedirectPath('/admin-tools', '/admin', adminOnly), '/admin');

// allowedPathPrefixes — multiple allowed roots.
const multi = { allowedPathPrefixes: ['/admin', '/dashboard'] } as const;
assert.equal(safeRedirectPath('/dashboard/x', '/admin', multi), '/dashboard/x');
assert.equal(safeRedirectPath('/other', '/admin', multi), '/admin');

// Encoded slash is rejected by prefix allow-lists rather than treated as a
// segment boundary.
const enc = safeRedirectPath('/admin%2Fproviders', '/admin', adminOnly);
assert.equal(enc, '/admin');

console.log('safe-redirect checks passed.');
