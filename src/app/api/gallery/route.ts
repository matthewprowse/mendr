import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { place_id, uploads } = body;

        if (!Array.isArray(uploads) || uploads.length === 0) {
            return NextResponse.json({ error: 'No uploads provided.' }, { status: 400 });
        }

        const supabase = await createSupabaseServerClient();

        const rows = uploads.map((u: { url: string; title: string; description: string; uploader: string }) => ({
            place_id: place_id ?? null,
            url: u.url,
            title: u.title || null,
            description: u.description || null,
            uploader_name: u.uploader || null,
            status: 'pending',
        }));

        const { error } = await supabase.from('gallery_uploads').insert(rows);

        if (error) {
            // Table may not exist yet — fail silently so the upload still succeeds
            console.warn('gallery_uploads insert warning:', error.message);
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Gallery API error:', e);
        return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
    }
}
