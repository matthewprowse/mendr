import { NextRequest } from 'next/server';
import { assessStartDescription } from '@/lib/start-description-quality';
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'validateStartDescription');
    if (limited) return limited;

    try {
        const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
        const text = typeof body?.text === 'string' ? body.text : '';
        const result = assessStartDescription(text);
        if (!result.ok) {
            return Response.json({ ok: false as const, message: result.message });
        }
        return Response.json({ ok: true as const });
    } catch {
        return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
}
