import { NextResponse } from 'next/server';
import { getServices } from '@/lib/fetch-services';
import { formatApiError } from '@/lib/utils';

export type { Service } from '@/lib/fetch-services';

/** GET /api/services — returns active services from Supabase, ordered by sort_order. */
export async function GET() {
    try {
        const services = await getServices();
        return NextResponse.json({ services });
    } catch (e: unknown) {
        console.error('Services API error:', e);
        return NextResponse.json({ error: formatApiError(e) }, { status: 500 });
    }
}
