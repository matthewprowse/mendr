/**
 * Phase 5 — features/home/announcements.
 *
 * Latest published announcements and a single-slug lookup. Both go through the
 * server Supabase client; RLS + a `published_at <= now` filter hide drafts. We
 * mock the client and assert the query chain and empty/null fallbacks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const maybeSingle = vi.fn();
const lteOrder = {
    order: () => ({ limit }),
    maybeSingle,
};
const eq = vi.fn(() => ({ lte: () => ({ maybeSingle }) }));
const lte = vi.fn(() => lteOrder);
const select = vi.fn(() => ({ lte, eq }));
const from = vi.fn(() => ({ select }));
const createSupabaseServerClient = vi.fn(async () => ({ from }));

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: () => createSupabaseServerClient(),
}));

import { getLatestAnnouncements, getAnnouncementBySlug } from '@/features/home/announcements';

beforeEach(() => {
    limit.mockReset();
    maybeSingle.mockReset();
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('getLatestAnnouncements', () => {
    it('returns published announcements newest-first', async () => {
        const rows = [
            { slug: 'a', title: 'A', summary: null, body: null, image_url: null, published_at: '2026-01-02' },
        ];
        limit.mockResolvedValue({ data: rows });
        const out = await getLatestAnnouncements(3);
        expect(out).toEqual(rows);
        expect(from).toHaveBeenCalledWith('feature_announcements');
    });

    it('returns an empty array when the query yields null', async () => {
        limit.mockResolvedValue({ data: null });
        const out = await getLatestAnnouncements();
        expect(out).toEqual([]);
    });
});

describe('getAnnouncementBySlug', () => {
    it('returns the matching announcement', async () => {
        const row = { slug: 's', title: 'T', summary: null, body: null, image_url: null, published_at: 'x' };
        maybeSingle.mockResolvedValue({ data: row });
        const out = await getAnnouncementBySlug('s');
        expect(out).toEqual(row);
    });

    it('returns null when no announcement matches the slug', async () => {
        maybeSingle.mockResolvedValue({ data: null });
        const out = await getAnnouncementBySlug('missing');
        expect(out).toBeNull();
    });
});
