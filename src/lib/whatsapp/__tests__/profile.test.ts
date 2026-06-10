import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const pstate: {
    select: Result;
    updates: Array<Record<string, unknown>>;
} = { select: { data: null, error: null }, updates: [] };

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseAdminClient: vi.fn(async () => ({
        from: () => {
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                update(payload: Record<string, unknown>) {
                    pstate.updates.push(payload);
                    return Promise.resolve({ data: null, error: null });
                },
                maybeSingle: () => Promise.resolve(pstate.select),
            };
            return builder;
        },
    })),
}));

import { getSavedLocations, saveLocationForUser } from '../profile';

beforeEach(() => {
    pstate.select = { data: null, error: null };
    pstate.updates = [];
    vi.clearAllMocks();
});

describe('getSavedLocations', () => {
    it('maps and filters the locations JSONB array', async () => {
        pstate.select = {
            data: {
                locations: [
                    { id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
                    { id: '', address: 'no id, dropped' },
                    { id: 'l2', address: '', lat: 1, lng: 2 },
                    'not-an-object',
                ],
            },
            error: null,
        };
        const locs = await getSavedLocations('user-1');
        expect(locs).toEqual([
            { id: 'l1', label: 'Home', address: '12 Main Rd', lat: -33.9, lng: 18.4 },
        ]);
    });

    it('returns [] when locations is absent', async () => {
        pstate.select = { data: { locations: null }, error: null };
        expect(await getSavedLocations('user-1')).toEqual([]);
    });

    it('returns [] on a query error', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        pstate.select = { data: null, error: { message: 'boom' } };
        expect(await getSavedLocations('user-1')).toEqual([]);
        errSpy.mockRestore();
    });
});

describe('saveLocationForUser', () => {
    it('appends a new location entry', async () => {
        pstate.select = { data: { locations: [] }, error: null };
        await saveLocationForUser('user-1', {
            address: '12 Main Rd, Claremont',
            lat: -33.9,
            lng: 18.4,
        });
        expect(pstate.updates).toHaveLength(1);
        const next = pstate.updates[0].locations as Array<Record<string, unknown>>;
        expect(next).toHaveLength(1);
        expect(next[0]).toMatchObject({
            address: '12 Main Rd, Claremont',
            lat: -33.9,
            lng: 18.4,
            label: 'Saved address',
        });
    });

    it('skips a duplicate location resolving to the same rounded coordinates', async () => {
        pstate.select = {
            data: { locations: [{ id: 'l1', address: 'x', lat: -33.9001, lng: 18.4001 }] },
            error: null,
        };
        await saveLocationForUser('user-1', {
            address: 'same place',
            lat: -33.9002,
            lng: 18.4003,
        });
        expect(pstate.updates).toHaveLength(0);
    });

    it('uses a provided label when given', async () => {
        pstate.select = { data: { locations: [] }, error: null };
        await saveLocationForUser('user-1', {
            label: 'Office',
            address: '5 Long St',
            lat: 1,
            lng: 2,
        });
        const next = pstate.updates[0].locations as Array<Record<string, unknown>>;
        expect(next[0].label).toBe('Office');
    });

    it('does not throw when the read/update path errors', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        pstate.select = { data: { locations: 'not-array' }, error: null };
        await expect(
            saveLocationForUser('user-1', { address: 'x', lat: 1, lng: 2 }),
        ).resolves.toBeUndefined();
        errSpy.mockRestore();
    });
});
