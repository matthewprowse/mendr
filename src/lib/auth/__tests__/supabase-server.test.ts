import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase-server.ts wires Next.js cookies into the Supabase SSR client and
// holds a module-level service-role singleton. We mock @supabase/ssr,
// @supabase/supabase-js, and next/headers, then reset modules each test so the
// admin singleton does not leak between cases.

const {
    createServerClientMock,
    createClientMock,
    cookiesMock,
    cookieStore,
} = vi.hoisted(() => {
    const store = {
        getAll: vi.fn(() => [] as Array<{ name: string; value: string }>),
        set: vi.fn(),
    };
    return {
        createServerClientMock: vi.fn(),
        createClientMock: vi.fn(),
        cookiesMock: vi.fn(async () => store),
        cookieStore: store,
    };
});

vi.mock('@supabase/ssr', () => ({
    createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));
vi.mock('@supabase/supabase-js', () => ({
    createClient: (...args: unknown[]) => createClientMock(...args),
}));
vi.mock('next/headers', () => ({
    cookies: () => cookiesMock(),
}));

const ORIG = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restoreEnv() {
    if (ORIG.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG.url;
    if (ORIG.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG.anon;
    if (ORIG.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG.service;
}

beforeEach(() => {
    vi.resetModules();
    createServerClientMock.mockReset();
    createServerClientMock.mockImplementation(() => ({ __kind: 'server' }));
    createClientMock.mockReset();
    createClientMock.mockImplementation(() => ({ __kind: 'admin' }));
    cookieStore.getAll.mockReset();
    cookieStore.getAll.mockReturnValue([]);
    cookieStore.set.mockReset();
    cookiesMock.mockReset();
    cookiesMock.mockResolvedValue(cookieStore);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

afterEach(() => {
    restoreEnv();
});

describe('createSupabaseServerClient', () => {
    it('passes the URL and anon key into createServerClient', async () => {
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await createSupabaseServerClient();
        expect(createServerClientMock).toHaveBeenCalledWith(
            'https://abc.supabase.co',
            'anon-key',
            expect.objectContaining({ cookies: expect.any(Object) })
        );
    });

    it('throws when the URL or anon key is missing', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await expect(createSupabaseServerClient()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });

    it('cookies.getAll delegates to the Next cookie store', async () => {
        cookieStore.getAll.mockReturnValue([{ name: 'sb', value: 'token' }]);
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await createSupabaseServerClient();
        const cookieConfig = createServerClientMock.mock.calls[0][2].cookies;
        expect(cookieConfig.getAll()).toEqual([{ name: 'sb', value: 'token' }]);
        expect(cookieStore.getAll).toHaveBeenCalled();
    });

    it('cookies.setAll writes each cookie back to the Next cookie store', async () => {
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await createSupabaseServerClient();
        const cookieConfig = createServerClientMock.mock.calls[0][2].cookies;
        cookieConfig.setAll([
            { name: 'sb-access', value: 'a', options: { path: '/' } },
            { name: 'sb-refresh', value: 'r', options: { path: '/' } },
        ]);
        expect(cookieStore.set).toHaveBeenCalledTimes(2);
        expect(cookieStore.set).toHaveBeenCalledWith('sb-access', 'a', { path: '/' });
        expect(cookieStore.set).toHaveBeenCalledWith('sb-refresh', 'r', { path: '/' });
    });

    it('cookies.setAll swallows errors thrown by an immutable cookie store', async () => {
        cookieStore.set.mockImplementation(() => {
            throw new Error('Cookies can only be modified in a Server Action');
        });
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await createSupabaseServerClient();
        const cookieConfig = createServerClientMock.mock.calls[0][2].cookies;
        expect(() => cookieConfig.setAll([{ name: 'x', value: 'y', options: {} }])).not.toThrow();
    });

    it('propagates an error thrown by cookies() (no next/headers context)', async () => {
        cookiesMock.mockRejectedValue(new Error('cookies() outside request scope'));
        const { createSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await expect(createSupabaseServerClient()).rejects.toThrow(/cookies\(\)/);
    });
});

describe('createSupabaseAdminClient', () => {
    it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        await expect(createSupabaseAdminClient()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it('calls createClient with the service-role key and session-less auth options', async () => {
        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        await createSupabaseAdminClient();
        expect(createClientMock).toHaveBeenCalledWith(
            'https://abc.supabase.co',
            'service-key',
            expect.objectContaining({
                auth: expect.objectContaining({
                    persistSession: false,
                    autoRefreshToken: false,
                }),
            })
        );
    });

    it('caches the admin client as a singleton across calls', async () => {
        const { createSupabaseAdminClient } = await import('@/lib/auth/supabase-server');
        const first = await createSupabaseAdminClient();
        const second = await createSupabaseAdminClient();
        expect(first).toBe(second);
        expect(createClientMock).toHaveBeenCalledTimes(1);
    });
});

describe('tryCreateSupabaseServerClient', () => {
    it('returns null when env is missing instead of throwing', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const { tryCreateSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await expect(tryCreateSupabaseServerClient()).resolves.toBeNull();
    });

    it('returns a configured server client when env is present', async () => {
        const { tryCreateSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        const client = await tryCreateSupabaseServerClient();
        expect(client).not.toBeNull();
        expect(createServerClientMock).toHaveBeenCalled();
    });

    it('its cookie callbacks delegate to the Next cookie store', async () => {
        cookieStore.getAll.mockReturnValue([{ name: 'sb', value: 'v' }]);
        const { tryCreateSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await tryCreateSupabaseServerClient();
        const cookieConfig = createServerClientMock.mock.calls[0][2].cookies;
        expect(cookieConfig.getAll()).toEqual([{ name: 'sb', value: 'v' }]);
        cookieConfig.setAll([{ name: 'a', value: 'b', options: {} }]);
        expect(cookieStore.set).toHaveBeenCalledWith('a', 'b', {});
    });

    it('its setAll callback swallows immutable-store errors', async () => {
        cookieStore.set.mockImplementation(() => {
            throw new Error('immutable');
        });
        const { tryCreateSupabaseServerClient } = await import('@/lib/auth/supabase-server');
        await tryCreateSupabaseServerClient();
        const cookieConfig = createServerClientMock.mock.calls[0][2].cookies;
        expect(() => cookieConfig.setAll([{ name: 'a', value: 'b', options: {} }])).not.toThrow();
    });
});
