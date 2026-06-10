import { describe, it, expect, vi, beforeEach } from 'vitest';

let count = 0;
const incr = vi.fn(async () => ++count);
const expire = vi.fn(async () => 1);

vi.mock('@upstash/redis', () => ({
    // Vitest 4 requires a function (not arrow) for constructor mocks (`new Redis()`)
    Redis: vi.fn(function (this: object) {
        return { incr, expire };
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    count = 0;
    process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    process.env.GOOGLE_DAILY_CALL_CAP = '3';
});

describe('googleSpendExceeded (M2)', () => {
    it('allows calls up to the cap, then trips the breaker', async () => {
        const { googleSpendExceeded } = await import('../spend-guard');
        expect(await googleSpendExceeded('geocode')).toBe(false); // 1
        expect(await googleSpendExceeded('geocode')).toBe(false); // 2
        expect(await googleSpendExceeded('geocode')).toBe(false); // 3 (== cap)
        expect(await googleSpendExceeded('geocode')).toBe(true); //  4 (> cap)
    });

    it('sets a TTL on the first increment of the day', async () => {
        const { googleSpendExceeded } = await import('../spend-guard');
        await googleSpendExceeded('directions');
        expect(expire).toHaveBeenCalledTimes(1);
    });
});

describe('googleSpendExceeded — fails open without Redis', () => {
    it('returns false when Upstash is not configured', async () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        vi.resetModules();
        const { googleSpendExceeded } = await import('../spend-guard');
        expect(await googleSpendExceeded('geocode')).toBe(false);
    });
});

describe('googleSpendExceeded — cap boundary', () => {
    it('denies when count is exactly at the cap (count == cap is > cap after increment)', async () => {
        // vi.resetModules() from previous test suite cleared the Redis singleton.
        // We must re-import after resetting so the fresh module uses the mocked Redis.
        vi.resetModules();
        count = 0;
        process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
        process.env.GOOGLE_DAILY_CALL_CAP = '3';
        const { googleSpendExceeded } = await import('../spend-guard');
        // calls 1–3 are allowed (count <= cap, since guard is strictly >)
        expect(await googleSpendExceeded('places')).toBe(false); // count=1
        expect(await googleSpendExceeded('places')).toBe(false); // count=2
        expect(await googleSpendExceeded('places')).toBe(false); // count=3 == cap → allowed (not > cap)
        // call 4: count=4 > cap → denied
        expect(await googleSpendExceeded('places')).toBe(true);
    });

    it('spendBreakerResponse returns a 503 JSON response', async () => {
        const { spendBreakerResponse } = await import('../spend-guard');
        const res = spendBreakerResponse();
        expect(res.status).toBe(503);
        const body = await res.json() as Record<string, string>;
        expect(body.error).toBe('temporarily_unavailable');
    });
});
