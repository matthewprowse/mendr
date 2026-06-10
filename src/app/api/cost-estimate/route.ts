/**
 * GET /api/cost-estimate?subcategoryId=... — public, cheap read of the cost
 * estimate for a fault type. Serves the cached (researched) value, falling back
 * to the static estimate in code. Never calls Brave; population is a separate
 * admin trigger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';
import { getCostEstimateCached } from '@/lib/cost/cost-estimate-service';

export async function GET(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'reportInfo');
    if (limited) return limited;

    const subcategoryId = req.nextUrl.searchParams.get('subcategoryId');
    const estimate = await getCostEstimateCached(subcategoryId);
    return NextResponse.json({ estimate });
}
