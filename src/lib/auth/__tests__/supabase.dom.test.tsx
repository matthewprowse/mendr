import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase.ts reads NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY at module-evaluation
// time and only constructs a real browser client when `window` is defined
// (this file runs in jsdom). We mock @supabase/ssr's createBrowserClient and
// reset modules between cases so each test controls the env it loads under.

const { createBrowserClientMock } = vi.hoisted(() => ({
    createBrowserClientMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
    createBrowserClient: (...args: unknown[]) => createBrowserClientMock(...args),
}));

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function fakeClient() {
    return {
        from: vi.fn(),
        auth: {},
        rpc: vi.fn(),
        channel: vi.fn(),
    };
}

describe('lib/auth/supabase (browser client factory)', () => {
    beforeEach(() => {
        vi.resetModules();
        createBrowserClientMock.mockReset();
        createBrowserClientMock.mockImplementation(() => fakeClient());
    });

    afterEach(() => {
        if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
        if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
    });

    it('getSupabase() constructs a real browser client when env is present', async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
        const mod = await import('@/lib/auth/supabase');
        const client = mod.getSupabase();
        expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
        expect(createBrowserClientMock).toHaveBeenCalledWith(
            'https://abc.supabase.co',
            'anon-key',
            expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce' }) })
        );
        expect(client).toHaveProperty('from');
        expect(client).toHaveProperty('auth');
        expect(client).toHaveProperty('rpc');
    });

    it('getSupabase() returns a singleton — the second call does not re-create the client', async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
        const mod = await import('@/lib/auth/supabase');
        const first = mod.getSupabase();
        const second = mod.getSupabase();
        expect(first).toBe(second);
        expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    });

    it('getSupabase() returns the graceful dummy client when env vars are missing', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('@/lib/auth/supabase');
        const client = mod.getSupabase();
        expect(createBrowserClientMock).not.toHaveBeenCalled();
        // The dummy client implements the methods the app relies on.
        expect(typeof client.from).toBe('function');
        expect(typeof client.auth.getSession).toBe('function');
        warn.mockRestore();
    });

    it('dummy client auth.getSession resolves to a null session', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('@/lib/auth/supabase');
        const client = mod.getSupabase();
        await expect(client.auth.getSession()).resolves.toEqual({
            data: { session: null },
            error: null,
        });
    });

    it('dummy client from().select() chain resolves to an empty result set', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('@/lib/auth/supabase');
        const client = mod.getSupabase();
        const result = await client.from('providers').select();
        expect(result).toEqual({ data: [], error: null });
    });

    it('exported `supabase` constant is the dummy client when env is missing', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mod = await import('@/lib/auth/supabase');
        expect(typeof mod.supabase.from).toBe('function');
        expect(typeof mod.supabase.auth.signOut).toBe('function');
    });
});
