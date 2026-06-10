/**
 * Tests for google-maps-js-loader.ts — ensureGoogleMapsLoaderOptions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @googlemaps/js-api-loader to capture setOptions calls
const mockSetOptions = vi.fn();

vi.mock('@googlemaps/js-api-loader', () => ({
    setOptions: mockSetOptions,
}));

beforeEach(() => {
    vi.clearAllMocks();
    // Reset the global flag so each test starts fresh
    const g = globalThis as Record<string, unknown>;
    delete g['__mendrGoogleMapsLoaderOptionsSet'];
    vi.resetModules();
});

describe('ensureGoogleMapsLoaderOptions', () => {
    it('calls setOptions with the provided API key', async () => {
        const { ensureGoogleMapsLoaderOptions } = await import('../google-maps-js-loader');
        ensureGoogleMapsLoaderOptions('test-api-key-123');
        expect(mockSetOptions).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'test-api-key-123' }),
        );
    });

    it('does NOT call setOptions when apiKey is empty', async () => {
        const { ensureGoogleMapsLoaderOptions } = await import('../google-maps-js-loader');
        ensureGoogleMapsLoaderOptions('');
        expect(mockSetOptions).not.toHaveBeenCalled();
    });

    it('only calls setOptions once even when called multiple times with same key', async () => {
        const { ensureGoogleMapsLoaderOptions } = await import('../google-maps-js-loader');
        ensureGoogleMapsLoaderOptions('my-key');
        ensureGoogleMapsLoaderOptions('my-key');
        ensureGoogleMapsLoaderOptions('my-key');
        expect(mockSetOptions).toHaveBeenCalledTimes(1);
    });

    it('sets the version to "weekly"', async () => {
        const { ensureGoogleMapsLoaderOptions } = await import('../google-maps-js-loader');
        ensureGoogleMapsLoaderOptions('test-key');
        expect(mockSetOptions).toHaveBeenCalledWith(
            expect.objectContaining({ v: 'weekly' }),
        );
    });
});
