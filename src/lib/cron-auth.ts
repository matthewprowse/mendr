import type { NextRequest } from 'next/server';

/**
 * Vercel Cron and manual runs: set CRON_SECRET in project env and call with
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !secret.trim()) return false;
    const auth = req.headers.get('authorization') || '';
    return auth === `Bearer ${secret.trim()}`;
}
