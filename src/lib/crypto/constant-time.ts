import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string equality for comparing secrets / tokens (findings L2,
 * L5). Avoids the early-exit timing leak of `===`. A length mismatch returns
 * false immediately — length is not the sensitive part for the tokens this
 * guards (bearer secrets, access codes), and `timingSafeEqual` requires equal
 * lengths anyway.
 */
export function constantTimeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}
