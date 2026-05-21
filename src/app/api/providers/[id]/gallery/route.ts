// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

function asFiles(value: FormDataEntryValue[] | undefined): File[] {
    if (!value) return [];
    return value.filter((v): v is File => typeof v !== 'string');
}

function safeJsonParse<T>(value: unknown): T | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const msg = (error as { message?: unknown }).message;
        if (typeof msg === 'string') return msg;
    }
    return String(error ?? 'Unknown error');
}

function getErrorField(error: unknown, field: 'code' | 'details' | 'hint'): string | null {
    if (typeof error !== 'object' || error === null) return null;
    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' && value.trim() ? value : null;
}

function isMissingRelationError(error: unknown): boolean {
    const msg = getErrorMessage(error).toLowerCase();
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null;
    return code === '42P01' || msg.includes('relation') && msg.includes('does not exist');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = await checkRateLimit(req, 'uploadImage');
    if (limited) return limited;

    try {
        const { id: providerId } = await params;
        if (!providerId) {
            return NextResponse.json({ error: 'Provider id is required' }, { status: 400 });
        }

        const form = await req.formData().catch(() => null);
        if (!form) {
            return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
        }

        // Support both upload shapes used in the app:
        // - `file` + optional `description`
        // - `files[]` + `captions` JSON array
        const files = [
            ...asFiles((form.getAll('files') as FormDataEntryValue[]) ?? []),
            ...(form.get('file') instanceof File ? [form.get('file') as File] : []),
        ];

        if (files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        if (files.some((f) => !f.type?.startsWith('image/'))) {
            return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 });
        }

        const captionsFromJson = safeJsonParse<string[]>(form.get('captions'));
        const singleDescription =
            typeof form.get('description') === 'string' ? String(form.get('description')).trim() : '';

        const captions =
            captionsFromJson && Array.isArray(captionsFromJson)
                ? captionsFromJson.map((c) => (typeof c === 'string' ? c : '')).slice(0, files.length)
                : singleDescription
                  ? Array.from({ length: files.length }, () => singleDescription)
                  : Array.from({ length: files.length }, () => '');

        const admin = await createSupabaseAdminClient();
        const { error: tableCheckErr } = await admin.from('provider_images').select('id').limit(1);
        if (tableCheckErr) {
            if (isMissingRelationError(tableCheckErr)) {
                return NextResponse.json(
                    {
                        error: 'Missing `provider_images` table. Gallery metadata storage is not configured.',
                    },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                { error: `Failed gallery table check: ${getErrorMessage(tableCheckErr)}` },
                { status: 503 }
            );
        }

        const rowsToInsert: Array<{
            provider_id: string;
            bucket: string;
            path: string;
            caption: string | null;
            source: string;
            source_ref: string;
            status: string;
            sort_order: number | null;
        }> = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = (file.name?.split('.').pop() || '').toLowerCase();
            const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
            const objectPath = `${providerId}/${crypto.randomUUID()}.${safeExt}`;
            const bucket = 'gallery';

            const bytes = await file.arrayBuffer();
            const uploadRes = await admin.storage.from(bucket).upload(objectPath, bytes, {
                contentType: file.type || 'image/jpeg',
                upsert: false,
            });

            if (uploadRes.error) {
                const uploadMsg = getErrorMessage(uploadRes.error);
                const missingBucket = uploadMsg.toLowerCase().includes('bucket') &&
                    uploadMsg.toLowerCase().includes('not found');
                if (missingBucket) {
                    return NextResponse.json(
                        { error: 'Missing Supabase storage bucket `gallery`.' },
                        { status: 503 }
                    );
                }
                return NextResponse.json({ error: uploadMsg }, { status: 502 });
            }

            const caption = (captions[i] ?? '').trim();
            rowsToInsert.push({
                provider_id: providerId,
                bucket,
                path: objectPath,
                caption: caption ? caption : null,
                source: 'scandio',
                source_ref: crypto.randomUUID(),
                status: 'pending',
                sort_order: 1000 + i,
            });
        }

        const { error: insertErr } = await admin.from('provider_images').insert(rowsToInsert);
        if (insertErr) {
            if (isMissingRelationError(insertErr)) {
                return NextResponse.json(
                    { error: 'Missing `provider_images` table. Gallery metadata storage is not configured.' },
                    { status: 503 }
                );
            }
            return NextResponse.json(
                {
                    error: `Failed to persist gallery metadata: ${getErrorMessage(insertErr)}`,
                    code: getErrorField(insertErr, 'code'),
                    details: getErrorField(insertErr, 'details'),
                    hint: getErrorField(insertErr, 'hint'),
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true, uploaded: rowsToInsert.length, source: 'scandio' });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

