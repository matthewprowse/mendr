import type { NextRequest } from 'next/server';
import { constantTimeEqual } from '@/lib/crypto/constant-time';

/**
 * Vercel Cron and manual runs: set CRON_SECRET in project env and call with
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret || !secret.trim()) return false;
    const auth = req.headers.get('authorization') || '';
    // Constant-time compare so the secret can't be recovered by timing (L5).
    return constantTimeEqual(auth, `Bearer ${secret.trim()}`);
}
