/**
 * Shared helpers for API route contract tests (Phase 3).
 *
 * The goal is to keep each route.test.ts tightly focused on the contract:
 * auth gate, validation, happy path, edges, rate-limit. Routes share a small
 * number of external surfaces (Supabase, Resend, Gemini, Upstash), so we
 * centralise the mock factories here.
 *
 * IMPORTANT: most routes import their dependencies at module load time. To
 * mock them, each route.test.ts uses `vi.mock(...)` at the top of the file
 * pointing at THIS module's factories. Keeping the factories small and
 * deterministic means the mocks compose well across tests.
 */

import type { NextRequest } from 'next/server';
import { NextRequest as NextRequestCtor } from 'next/server';
import { vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Request builders
// ─────────────────────────────────────────────────────────────────────────────

export interface MakeRequestOptions {
    method?: string;
    path?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    /** Convenience flag — when true, sets Authorization: Bearer test-cron-secret. */
    cron?: boolean;
    /** Convenience flag — when true, adds an admin_session cookie. */
    admin?: boolean;
    /** Raw body — bypasses JSON.stringify when set. Useful for malformed-JSON tests. */
    rawBody?: string;
}

export function makeRequest(opts: MakeRequestOptions = {}): NextRequest {
    const method = opts.method ?? 'GET';
    const url = `http://localhost:3000${opts.path ?? '/api/test'}`;
    const headers = new Headers(opts.headers ?? {});
    if (opts.body !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }
    if (opts.cron && !headers.has('authorization')) {
        headers.set('authorization', `Bearer ${process.env.CRON_SECRET ?? 'test-cron-secret'}`);
    }

    let cookieHeader = '';
    if (opts.cookies) {
        cookieHeader = Object.entries(opts.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }
    if (opts.admin) {
        // The test must set ADMIN_PASSWORD + a valid session cookie before calling
        // — see `withAdminCookie` for the helper. For most admin routes the tests
        // mock requireAdmin directly, so this is rarely needed.
    }
    if (cookieHeader) headers.set('cookie', cookieHeader);

    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) {
        init.body = opts.rawBody !== undefined ? opts.rawBody : JSON.stringify(opts.body);
    } else if (opts.rawBody !== undefined) {
        init.body = opts.rawBody;
    }

    // Next's RequestInit differs from the DOM lib's (notably `signal`); cast to
    // the constructor's own parameter type rather than the global RequestInit.
    return new NextRequestCtor(url, init as ConstructorParameters<typeof NextRequestCtor>[1]);
}

/** Add the CRON bearer header to an existing request body builder. */
export function withCron(opts: MakeRequestOptions = {}): MakeRequestOptions {
    return { ...opts, cron: true };
}

/** Add the admin session cookie. Tests should also `mockRequireAdmin(true)` for code-path coverage. */
export function withAdmin(opts: MakeRequestOptions = {}): MakeRequestOptions {
    return { ...opts, admin: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock client
// ─────────────────────────────────────────────────────────────────────────────

export interface SupabaseQueryResult<T = unknown> {
    data: T | null;
    error: { message: string; code?: string } | null;
    count?: number | null;
}

export type ChainResolver = (table: string, op: string) => SupabaseQueryResult;

interface MockSupabaseOptions {
    /**
     * Per-table response map. Keyed by table name; the value is the result
     * returned for any terminal call on that builder.
     */
    tables?: Record<string, SupabaseQueryResult | ChainResolver>;
    /** Override the auth.getUser response. */
    user?: { id: string; email?: string } | null;
    /** Override rpc results, keyed by rpc name. */
    rpc?: Record<string, SupabaseQueryResult>;
    /** Storage upload response. */
    storageUploadResult?: SupabaseQueryResult<{ path: string }>;
}

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Build a flexible Supabase client mock that handles the common query
 * patterns: `.from(table).select(...).eq(...).single()`,
 * `.from(table).insert(...)`, `.from(table).update(...).eq(...)`, etc.
 *
 * The builder records the table + the first terminal operation and resolves
 * with the configured result. Chain methods (`eq`, `gt`, `lt`, `order`,
 * `limit`, `range`, etc.) are no-ops that return the builder so a long chain
 * still works without per-test setup.
 *
 * For complex routes that need different results for different queries on the
 * same table, pass a `ChainResolver` function instead of a static result.
 */
export function mockSupabaseClient(options: MockSupabaseOptions = {}) {
    const tables = options.tables ?? {};

    function buildQueryBuilder(table: string) {
        let operation = 'select';

        // Resolve the configured result lazily, so the test can inspect
        // `operation` if it sets up a function-resolver.
        const resolve = (): SupabaseQueryResult => {
            const entry = tables[table];
            if (typeof entry === 'function') {
                return entry(table, operation);
            }
            return (
                entry ?? {
                    data: null,
                    error: null,
                    count: 0,
                }
            );
        };

        // Mark the chain as thenable so `await supabase.from(...).insert(...)`
        // resolves with the configured result.
        const builder: Record<string, AnyFn> = {};

        const chainMethods = [
            'select',
            'insert',
            'update',
            'upsert',
            'delete',
            'eq',
            'neq',
            'gt',
            'gte',
            'lt',
            'lte',
            'in',
            'is',
            'not',
            'or',
            'and',
            'ilike',
            'like',
            'contains',
            'containedBy',
            'order',
            'limit',
            'range',
            'match',
            'filter',
            'overlaps',
            'csv',
            'returns',
            'maybeSingle',
            'single',
            'throwOnError',
        ];

        for (const name of chainMethods) {
            builder[name] = vi.fn((..._args: unknown[]) => {
                if (['insert', 'update', 'upsert', 'delete', 'select'].includes(name)) {
                    operation = name;
                }
                if (name === 'single' || name === 'maybeSingle') {
                    return Promise.resolve(resolve());
                }
                return builder;
            });
        }

        // Make the builder awaitable. Assign through a loose `then` shape — the
        // strict PromiseLike generic signature is not needed at the call sites,
        // which only `await` the builder.
        (builder as unknown as { then: unknown }).then = (
            onFulfilled?: (value: SupabaseQueryResult) => unknown,
            onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);

        return builder;
    }

    const client = {
        from: vi.fn((table: string) => buildQueryBuilder(table)),
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: options.user ?? null },
                error: null,
            })),
            getSession: vi.fn(async () => ({
                data: { session: options.user ? { user: options.user } : null },
                error: null,
            })),
            admin: {
                createUser: vi.fn(async () => ({ data: { user: options.user }, error: null })),
                deleteUser: vi.fn(async () => ({ data: null, error: null })),
                updateUserById: vi.fn(async () => ({
                    data: { user: options.user },
                    error: null,
                })),
                generateLink: vi.fn(async () => ({
                    data: { properties: { action_link: 'https://example.com/x' } },
                    error: null,
                })),
            },
            signInWithPassword: vi.fn(async () => ({
                data: { user: options.user, session: null },
                error: null,
            })),
        },
        rpc: vi.fn(async (name: string, _args?: unknown) => {
            return options.rpc?.[name] ?? { data: 1, error: null };
        }),
        storage: {
            from: vi.fn((_bucket: string) => ({
                upload: vi.fn(
                    async () =>
                        options.storageUploadResult ?? {
                            data: { path: 'uploads/file.bin' },
                            error: null,
                        },
                ),
                createSignedUrl: vi.fn(async () => ({
                    data: { signedUrl: 'https://example.com/signed' },
                    error: null,
                })),
                getPublicUrl: vi.fn(() => ({
                    data: { publicUrl: 'https://example.com/public' },
                })),
                remove: vi.fn(async () => ({ data: [], error: null })),
                list: vi.fn(async () => ({ data: [], error: null })),
            })),
        },
    };

    return client;
}

export type MockSupabaseClient = ReturnType<typeof mockSupabaseClient>;

// ─────────────────────────────────────────────────────────────────────────────
// Resend (email) mock
// ─────────────────────────────────────────────────────────────────────────────

export interface MockResendCalls {
    send: Array<{
        to: string | string[];
        from: string;
        subject: string;
        text?: string;
        html?: string;
    }>;
}

export function mockResendClient() {
    const calls: MockResendCalls = { send: [] };
    const send = vi.fn(async (payload: MockResendCalls['send'][number]) => {
        calls.send.push(payload);
        return { data: { id: `resend-${calls.send.length}` }, error: null };
    });
    const client = {
        emails: { send },
    };
    // The Resend constructor returns an instance — tests typically mock the
    // module so `new Resend(apiKey)` yields this object.
    return { client, calls, send };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini (Google Generative AI) mock
// ─────────────────────────────────────────────────────────────────────────────

export interface MockGeminiOptions {
    text?: string;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export function mockGeminiClient(opts: MockGeminiOptions = {}) {
    const text = opts.text ?? '{}';
    const generateContent = vi.fn(async () => ({
        response: {
            text: () => text,
            usageMetadata: opts.usageMetadata ?? {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
            },
        },
    }));
    const generateContentStream = vi.fn(async () => ({
        stream: (async function* () {
            yield { text: () => text };
        })(),
        response: Promise.resolve({
            text: () => text,
            usageMetadata: opts.usageMetadata ?? {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
            },
        }),
    }));
    return { generateContent, generateContentStream };
}

// ─────────────────────────────────────────────────────────────────────────────
// Upstash redis mock (for routes that touch the limiter directly)
// ─────────────────────────────────────────────────────────────────────────────

export function mockUpstashRedis() {
    const store = new Map<string, unknown>();
    return {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        set: vi.fn(async (k: string, v: unknown) => {
            store.set(k, v);
            return 'OK';
        }),
        del: vi.fn(async (k: string) => {
            const had = store.has(k);
            store.delete(k);
            return had ? 1 : 0;
        }),
        incr: vi.fn(async (k: string) => {
            const next = ((store.get(k) as number) ?? 0) + 1;
            store.set(k, next);
            return next;
        }),
        expire: vi.fn(async () => 1),
        zadd: vi.fn(async () => 1),
        zremrangebyscore: vi.fn(async () => 0),
        zcard: vi.fn(async () => 0),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Body helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a NextResponse JSON body. Centralised so tests don't repeat the
 * ceremony of awaiting `.json()` everywhere.
 */
export async function readJson<T = unknown>(res: Response): Promise<T> {
    return (await res.json()) as T;
}
