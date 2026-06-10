import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Redis client is constructed lazily; with no Upstash env vars the module
// falls back to an in-process Map. We mock @upstash/redis so that, when env is
// present, we can exercise the Redis path too.
const redisSet = vi.fn();

vi.mock('@upstash/redis', () => ({
    Redis: class {
        set = redisSet;
    },
}));

const ENV = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    redisSet.mockReset();
    for (const k of ENV) saved[k] = process.env[k];
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
});

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

describe('claimMessage — in-memory fallback (no Upstash configured)', () => {
    it('returns true exactly once per message id', async () => {
        const { claimMessage } = await import('../dedupe');
        const id = `m-${Math.random()}`;
        expect(await claimMessage(id)).toBe(true);
        expect(await claimMessage(id)).toBe(false);
    });

    it('treats distinct ids independently', async () => {
        const { claimMessage } = await import('../dedupe');
        expect(await claimMessage(`a-${Math.random()}`)).toBe(true);
        expect(await claimMessage(`b-${Math.random()}`)).toBe(true);
    });
});

describe('claimMessage — Redis configured', () => {
    it('claims via redis SET NX and returns true on "OK"', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
        redisSet.mockResolvedValue('OK');
        const { claimMessage } = await import('../dedupe');
        const res = await claimMessage('wamid.redis');
        expect(res).toBe(true);
        expect(redisSet).toHaveBeenCalledWith(
            'wa:msg:wamid.redis',
            '1',
            expect.objectContaining({ nx: true }),
        );
    });

    it('returns false when redis SET NX reports the key already exists (null)', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
        redisSet.mockResolvedValue(null);
        const { claimMessage } = await import('../dedupe');
        expect(await claimMessage('wamid.dup')).toBe(false);
    });

    it('fails open (returns true) on a redis error', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
        redisSet.mockRejectedValue(new Error('redis down'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { claimMessage } = await import('../dedupe');
        expect(await claimMessage('wamid.err')).toBe(true);
        errSpy.mockRestore();
    });
});
