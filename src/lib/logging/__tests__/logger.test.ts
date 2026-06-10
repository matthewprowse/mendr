/**
 * Unit tests for the structured `logger`.
 *
 * The logger emits one JSON line per call, routed to console.error for
 * `error`, console.warn for `warn`, and console.log for `debug`/`info`. Each
 * line carries `level`, `event`, and any caller-supplied `data` fields. The
 * `error` helper additionally normalises an unknown thrown value into either
 * `{ message, stack }` (Error) or `{ raw }` (anything else).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

function lastJson(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
    const call = spy.mock.calls.at(-1);
    return JSON.parse(call?.[0] as string) as Record<string, unknown>;
}

describe('logger', () => {
    let log: ReturnType<typeof vi.spyOn>;
    let warn: ReturnType<typeof vi.spyOn>;
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        log = vi.spyOn(console, 'log').mockImplementation(() => {});
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        error = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('routes debug and info to console.log with the level tagged', () => {
        logger.debug('cache_hit');
        logger.info('request_done');
        expect(log).toHaveBeenCalledTimes(2);
        expect(lastJson(log)).toMatchObject({ level: 'info', event: 'request_done' });
        expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
            level: 'debug',
            event: 'cache_hit',
        });
    });

    it('routes warn to console.warn', () => {
        logger.warn('slow_query', { ms: 1200 });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
        expect(lastJson(warn)).toEqual({ level: 'warn', event: 'slow_query', ms: 1200 });
    });

    it('spreads caller data into the log entry', () => {
        logger.info('match', { providerId: 'p1', count: 3 });
        expect(lastJson(log)).toEqual({
            level: 'info',
            event: 'match',
            providerId: 'p1',
            count: 3,
        });
    });

    it('error() routes to console.error and unpacks an Error into message + stack', () => {
        const err = new Error('boom');
        logger.error('upload_failed', err, { userId: 'u1' });
        expect(error).toHaveBeenCalledTimes(1);
        const entry = lastJson(error);
        expect(entry).toMatchObject({
            level: 'error',
            event: 'upload_failed',
            message: 'boom',
            userId: 'u1',
        });
        expect(typeof entry.stack).toBe('string');
    });

    it('error() stringifies a non-Error thrown value into `raw`', () => {
        logger.error('weird', 'just a string');
        const entry = lastJson(error);
        expect(entry).toMatchObject({ level: 'error', event: 'weird', raw: 'just a string' });
        expect('message' in entry).toBe(false);
        expect('stack' in entry).toBe(false);
    });

    it('error() data overrides keys from the error payload when they collide', () => {
        // `data` is spread last, so an explicit `message` wins over the Error's.
        logger.error('e', new Error('original'), { message: 'overridden' });
        expect(lastJson(error).message).toBe('overridden');
    });

    it('emits a single parseable JSON line per call', () => {
        logger.warn('x');
        expect(() => JSON.parse(warn.mock.calls[0][0] as string)).not.toThrow();
    });
});
