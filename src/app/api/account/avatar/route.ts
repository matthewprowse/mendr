/**
 * POST   /api/account/avatar — upload or replace the current user's profile photo.
 * DELETE /api/account/avatar — remove the current user's profile photo.
 *
 * POST accepts:   multipart/form-data  { file: File }
 * POST validates: auth · magic-byte MIME check (JPEG / PNG / WebP only) · 5 MB cap
 * POST stores:    gallery bucket at  avatars/{userId}  (upsert — safe to call repeatedly)
 * Both update:    profiles.avatar_url  +  auth user_metadata.avatar_url so UserAvatar
 *                 reflects the change immediately after the client refreshes its session.
 * POST returns:   { ok: true, avatarUrl: string }
 * DELETE returns: { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createSupabaseServerClient,
    createSupabaseAdminClient,
} from '@/lib/auth/supabase-server';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Detect MIME from magic bytes — never trust the Content-Type header.
 * Only JPEG, PNG, and WebP are accepted for profile photos.
 */
function detectMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (
        bytes[0] === 0x89 && bytes[1] === 0x50 &&
        bytes[2] === 0x4e && bytes[3] === 0x47
    ) return 'image/png';
    if (
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return 'image/webp';
    return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    // --- Auth ---
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // --- Parse body ---
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!file || typeof (file as Blob).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'Missing file.' }, { status: 400 });
    }

    const arrayBuffer = await (file as Blob).arrayBuffer();

    // --- Size check ---
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
        return NextResponse.json(
            { error: 'File too large. Maximum size is 5 MB.' },
            { status: 413 },
        );
    }

    // --- MIME check ---
    const bytes = new Uint8Array(arrayBuffer);
    const mimeType = detectMime(bytes);
    if (!mimeType) {
        return NextResponse.json(
            { error: 'Unsupported file type. Please upload a JPEG, PNG, or WebP image.' },
            { status: 415 },
        );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
        return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }

    const admin = await createSupabaseAdminClient();

    // Stable path per user — repeat uploads overwrite cleanly.
    const objectPath = `avatars/${user.id}`;

    const { error: uploadError } = await admin.storage
        .from('gallery')
        .upload(objectPath, arrayBuffer, {
            contentType: mimeType,
            upsert: true,
        });

    if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Cache-bust so the browser fetches the new image even if the path is unchanged.
    const avatarUrl =
        `${supabaseUrl}/storage/v1/object/public/gallery/${objectPath}?t=${Date.now()}`;

    // --- Persist to profiles ---
    const { error: profileError } = await admin
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);

    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // --- Sync to auth user_metadata ---
    // Merges avatar_url into the existing metadata; all other fields are preserved.
    // The client calls auth.refreshSession() after this so UserAvatar picks it up.
    await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { avatar_url: avatarUrl },
    });

    return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE(): Promise<NextResponse> {
    // --- Auth ---
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = await createSupabaseAdminClient();

    // Remove the file from storage (best-effort — don't block on failure).
    await admin.storage.from('gallery').remove([`avatars/${user.id}`]);

    // Clear avatar_url in profiles.
    const { error: profileError } = await admin
        .from('profiles')
        .update({ avatar_url: null })
        .or(`id.eq.${user.id},user_id.eq.${user.id}`);

    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Clear from auth user_metadata so UserAvatar reverts to initials after
    // the client refreshes its session.
    await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { avatar_url: null },
    });

    return NextResponse.json({ ok: true });
}
