import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

import { refreshProviderWebsiteById } from '../refresh-provider-website';

const htmlResponse = (html: string) =>
    new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });

beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});

afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe('refreshProviderWebsiteById', () => {
    it('rejects an empty id', async () => {
        adminClient = mockSupabaseClient();
        expect(await refreshProviderWebsiteById('')).toEqual({
            ok: false,
            error: 'Provider id is required',
        });
    });

    it('fails when the provider is not found', async () => {
        adminClient = mockSupabaseClient({ tables: { providers: { data: null, error: null } } });
        expect(await refreshProviderWebsiteById('prov-1')).toEqual({
            ok: false,
            error: 'Provider not found',
        });
    });

    it('fails when the provider has no website', async () => {
        adminClient = mockSupabaseClient({
            tables: { providers: { data: { id: 'prov-1', website: '', about: null, past_work: null }, error: null } },
        });
        expect(await refreshProviderWebsiteById('prov-1')).toEqual({
            ok: false,
            error: 'Provider has no website URL',
        });
    });

    it('fails when the website fetch returns a non-200', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', website: 'https://acme.example', about: null, past_work: null },
                    error: null,
                },
            },
        });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
        expect(await refreshProviderWebsiteById('prov-1')).toEqual({
            ok: false,
            error: 'Failed to fetch website (500)',
        });
    });

    it('fails when the website returns non-HTML content', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', website: 'https://acme.example', about: null, past_work: null },
                    error: null,
                },
            },
        });
        vi.spyOn(global, 'fetch').mockResolvedValue(
            new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        );
        expect(await refreshProviderWebsiteById('prov-1')).toEqual({
            ok: false,
            error: 'Website did not return HTML content',
        });
    });

    it('parses about/past_work and returns analysis on success', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', website: 'https://acme.example', about: null, past_work: null },
                    error: null,
                },
            },
        });
        const html =
            '<html><body><p>We are an expert plumbing team.</p><p>Recent work: a big project last month.</p></body></html>';
        vi.spyOn(global, 'fetch').mockResolvedValue(htmlResponse(html));

        const result = await refreshProviderWebsiteById('prov-1');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.provider_id).toBe('prov-1');
        expect(result.website).toBe('https://acme.example');
        expect(result.about).toContain('expert plumbing team');
        expect(result.past_work).toContain('Recent work');
        expect(result.images_found).toBe(0);
        expect(result.images_saved).toBe(0);
        expect(result.analysis.word_count).toBeGreaterThan(0);
    });

    it('counts images found in the HTML', async () => {
        adminClient = mockSupabaseClient({
            tables: {
                providers: {
                    data: { id: 'prov-1', website: 'https://acme.example', about: null, past_work: null },
                    error: null,
                },
            },
        });
        const html =
            '<html><body><p>Quality work for homes.</p><img src="https://acme.example/1.jpg"></body></html>';
        const fetchSpy = vi.spyOn(global, 'fetch');
        fetchSpy.mockResolvedValueOnce(htmlResponse(html));
        // Image fetch fails so it is not saved, but it is counted as found.
        fetchSpy.mockResolvedValueOnce(new Response('err', { status: 404 }));

        const result = await refreshProviderWebsiteById('prov-1');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.images_found).toBe(1);
        expect(result.images_saved).toBe(0);
    });
});
