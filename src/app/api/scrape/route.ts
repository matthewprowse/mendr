import { NextRequest, NextResponse } from 'next/server';

const DELAY_MS = 2000;

type ScrapeArea = { name: string; lat: number; lng: number; radiusM: number };

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { areas, trades } = body as { areas?: ScrapeArea[]; trades?: string[] };

        if (!Array.isArray(areas) || areas.length === 0 || !Array.isArray(trades) || trades.length === 0) {
            return NextResponse.json(
                { error: 'areas (array) and trades (array) are required' },
                { status: 400 }
            );
        }

        const origin = req.nextUrl?.origin || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const results: { area: string; trade: string; ok: boolean; count: number; error?: string }[] = [];
        let totalCached = 0;

        for (const area of areas) {
            const { name, lat, lng, radiusM } = area;
            if (typeof lat !== 'number' || typeof lng !== 'number' || typeof radiusM !== 'number') {
                results.push({ area: name || '?', trade: '', ok: false, count: 0, error: 'Invalid area (lat, lng, radiusM required)' });
                continue;
            }
            for (const trade of trades) {
                try {
                    const res = await fetch(`${origin}/api/providers`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lat, lng, trade, radius: radiusM }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.providers) {
                        const count = (data.providers?.length ?? 0) + (data.emergingProviders?.length ?? 0) + (data.nearbyOnlyProviders?.length ?? 0);
                        totalCached += count;
                        results.push({ area: name, trade, ok: true, count });
                    } else {
                        results.push({ area: name, trade, ok: false, count: 0, error: data.error || res.statusText });
                    }
                } catch (e) {
                    results.push({ area: name, trade, ok: false, count: 0, error: (e as Error).message });
                }
                await new Promise((r) => setTimeout(r, DELAY_MS));
            }
        }

        return NextResponse.json({ results, totalCached });
    } catch (e) {
        console.error('Scrape API error:', e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
