import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabaseClient, type MockSupabaseClient } from '@/__tests__/helpers/route-test';

let serverClient: MockSupabaseClient;
let adminClient: MockSupabaseClient;

vi.mock('@/lib/auth/supabase-server', () => ({
    createSupabaseServerClient: vi.fn(async () => serverClient),
    createSupabaseAdminClient: vi.fn(async () => adminClient),
}));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

function uploadReq(bytes: number[] | Uint8Array): NextRequest {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    fd.append('file', blob, 'a.png');
    return new NextRequest('http://localhost:3000/api/account/avatar', { method: 'POST', body: fd });
}

function emptyReq(): NextRequest {
    return new NextRequest('http://localhost:3000/api/account/avatar', { method: 'POST', body: new FormData() });
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
});

describe('POST /api/account/avatar', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(uploadReq(PNG))).status).toBe(401);
    });

    it('400 when no file is supplied', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(emptyReq())).status).toBe(400);
    });

    it('415 for an unsupported file type', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const { POST } = await import('./route');
        expect((await POST(uploadReq([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).status).toBe(415);
    });

    it('413 when the file exceeds the size cap', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient();
        const big = new Uint8Array(5 * 1024 * 1024 + 1);
        big.set(PNG);
        const { POST } = await import('./route');
        expect((await POST(uploadReq(big))).status).toBe(413);
    });

    it('uploads, persists and returns the avatar url', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ tables: { profiles: { data: null, error: null } } });
        const { POST } = await import('./route');
        const res = await POST(uploadReq(PNG));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.avatarUrl).toContain('https://proj.supabase.co/storage/v1/object/public/gallery/avatars/user-1');
        expect(adminClient.auth.admin.updateUserById).toHaveBeenCalled();
    });

    it('500 when the storage upload fails', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ storageUploadResult: { data: null, error: { message: 'boom' } } });
        const { POST } = await import('./route');
        expect((await POST(uploadReq(PNG))).status).toBe(500);
    });
});

describe('DELETE /api/account/avatar', () => {
    it('401 when unauthenticated', async () => {
        serverClient = mockSupabaseClient({ user: null });
        adminClient = mockSupabaseClient();
        const { DELETE } = await import('./route');
        expect((await DELETE()).status).toBe(401);
    });

    it('clears the avatar in storage, profiles and auth metadata', async () => {
        serverClient = mockSupabaseClient({ user: { id: 'user-1' } });
        adminClient = mockSupabaseClient({ tables: { profiles: { data: null, error: null } } });
        const { DELETE } = await import('./route');
        const res = await DELETE();
        expect(res.status).toBe(200);
        expect((await res.json()).ok).toBe(true);
        expect(adminClient.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', { user_metadata: { avatar_url: null } });
    });
});
