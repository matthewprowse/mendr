import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

function safeFileName(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'image';
    // Replace anything filesystem-unfriendly with `_` to avoid path traversal.
    return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function POST(req: NextRequest) {
    const formData = await req.formData();
    const conversationId = String(formData.get('conversationId') || '').trim();

    const initialImageDescriptionRaw = formData.get('initial_image_description');
    const initial_image_description =
        typeof initialImageDescriptionRaw === 'string' ? initialImageDescriptionRaw.trim() : null;

    const file = formData.get('file') as any;
    const fileType = typeof file?.type === 'string' && file.type.trim() ? file.type : 'image/jpeg';
    const fileName = typeof file?.name === 'string' ? file.name : 'image';

    if (!conversationId) {
        return Response.json({ error: 'Missing conversationId' }, { status: 400 });
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
        return Response.json({ error: 'Missing file' }, { status: 400 });
    }

    const admin = await createSupabaseAdminClient();

    // Public bucket so the diagnosis page can load the image by URL.
    const bucket = 'gallery';
    const ext = fileType.includes('png')
        ? 'png'
        : fileType.includes('webp')
          ? 'webp'
          : fileType.includes('gif')
            ? 'gif'
            : fileType.includes('jpeg') || fileType.includes('jpg')
              ? 'jpg'
              : '';

    const nameExt = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';
    const finalExt = ext || nameExt;

    const originalBase = fileName.replace(/\.[^.]+$/, '');
    const baseName = safeFileName(originalBase);
    const time = Date.now();
    const objectPath = `welcome_scans/${conversationId}/${time}-${baseName}${finalExt ? `.${finalExt}` : ''}`;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const { error: uploadErr } = await admin.storage
            .from(bucket)
            .upload(objectPath, arrayBuffer, {
                contentType: fileType,
                upsert: true,
            });

        if (uploadErr) {
            return Response.json({ error: uploadErr.message }, { status: 500 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
            return Response.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
        }

        const imageUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;

        const { error: convErr } = await admin
            .from('conversations')
            .upsert({
                id: conversationId,
                title: 'New Diagnosis',
                image_url: imageUrl,
                initial_image_description: initial_image_description || null,
            })
            .select('id')
            .single();

        if (convErr) {
            return Response.json({ error: convErr.message }, { status: 500 });
        }

        return Response.json({ imageUrl });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload failed';
        return Response.json({ error: message }, { status: 500 });
    }
}

