import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseJson } from '@/lib/api/validate';
import { makeRequest } from '@/__tests__/helpers/route-test';

const schema = z.object({ name: z.string().min(2), age: z.number().int().optional() });

describe('parseJson (M13)', () => {
    it('returns typed data for a valid body', async () => {
        const res = await parseJson(makeRequest({ method: 'POST', body: { name: 'Ada' } }), schema);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.name).toBe('Ada');
    });

    it('returns a 400 for an invalid body', async () => {
        const res = await parseJson(makeRequest({ method: 'POST', body: { name: 'x' } }), schema);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.response.status).toBe(400);
    });

    it('returns a 400 for malformed JSON', async () => {
        const res = await parseJson(
            makeRequest({ method: 'POST', body: undefined, rawBody: 'not json' }),
            schema,
        );
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.response.status).toBe(400);
    });
});
