import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';

function toAbsoluteUrl(baseUrl: string, src: string): string | null {
    try {
        return new URL(src, baseUrl).toString();
    } catch {
        return null;
    }
}

function stripHtml(html: string): string {
    if (!html) return '';
    let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/<\/(p|div|br|li|h[1-6])>/gi, '$1_BREAK_');
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    const parts = cleaned.split('_BREAK_').map((p) => p.trim()).filter(Boolean);
    return parts.join('\n');
}

function splitAboutAndPast(text: string): { about: string; past: string } {
    if (!text) return { about: '', past: '' };
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return { about: '', past: '' };

    const aboutLines: string[] = [];
    const pastLines: string[] = [];

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (
            lower.includes('project') ||
            lower.includes('portfolio') ||
            lower.includes('our work') ||
            lower.includes('recent work')
        ) {
            pastLines.push(line);
        } else {
            aboutLines.push(line);
        }
    }

    const about = aboutLines.join('\n').slice(0, 8000);
    const past = pastLines.length > 0 ? pastLines.join('\n').slice(0, 8000) : '';
    return { about, past };
}

export type RefreshProviderWebsiteResult =
    | {
          ok: true;
          provider_id: string;
          website: string;
          about: string | null;
          past_work: string | null;
          websiteText: string;
          images_found: number;
          images_saved: number;
          analysis: {
              word_count: number;
              line_count: number;
          };
      }
    | { ok: false; error: string };

export async function refreshProviderWebsiteById(id: string): Promise<RefreshProviderWebsiteResult> {
    if (!id) return { ok: false, error: 'Provider id is required' };

    const admin = await createSupabaseAdminClient();
    const { data: provider, error: providerErr } = await admin
        .from('providers')
        .select('id, website, about, past_work')
        .eq('id', id)
        .single();

    if (providerErr || !provider) {
        return { ok: false, error: 'Provider not found' };
    }

    const website = typeof provider.website === 'string' ? provider.website.trim() : '';
    if (!website) {
        return { ok: false, error: 'Provider has no website URL' };
    }

    const res = await fetch(website, {
        method: 'GET',
        headers: {
            'User-Agent': 'MendaBot/1.0 (+https://menda.co.za)', // TODO(menda-domain): update User-Agent once menda.co.za is confirmed
            Accept: 'text/html,application/xhtml+xml',
        },
    });

    if (!res.ok) {
        return {
            ok: false,
            error: `Failed to fetch website (${res.status})`,
        };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
        return {
            ok: false,
            error: 'Website did not return HTML content',
        };
    }

    const html = await res.text();
    const text = stripHtml(html);
    const { about, past } = splitAboutAndPast(text);

    const imgRegex = /<img[^>]+src=["']?([^"'>\s]+)["']?[^>]*>/gi;
    const images: string[] = [];
    let match: RegExpExecArray | null;
    const maxImages = 20;

    while ((match = imgRegex.exec(html)) && images.length < maxImages) {
        const srcRaw = match[1];
        if (!srcRaw) continue;
        const abs = toAbsoluteUrl(website, srcRaw);
        if (!abs) continue;
        if (!images.includes(abs)) images.push(abs);
    }

    let savedCount = 0;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

    for (let i = 0; i < images.length; i += 1) {
        const imgUrl = images[i];
        try {
            const imgRes = await fetch(imgUrl, { method: 'GET' });
            if (!imgRes.ok) continue;
            const imgType = imgRes.headers.get('content-type') || 'image/jpeg';
            if (!imgType.startsWith('image/')) continue;
            const bytes = await imgRes.arrayBuffer();
            if (bytes.byteLength === 0) continue;

            const ext = imgType.includes('png')
                ? 'png'
                : imgType.includes('webp')
                  ? 'webp'
                  : imgType.includes('gif')
                    ? 'gif'
                    : 'jpg';
            const slug = `website-${i}-${Math.random().toString(36).slice(2, 10)}`;
            const path = `providers/${provider.id}/website/${slug}.${ext}`;

            const { error: uploadErr } = await admin.storage
                .from('gallery')
                .upload(path, bytes, { contentType: imgType, upsert: true });
            if (uploadErr) continue;

            const sourceRef = imgUrl.slice(0, 512);
            const { error: upsertErr } = await admin.from('provider_images').upsert(
                {
                    provider_id: provider.id,
                    source: 'website',
                    source_ref: sourceRef,
                    bucket: 'gallery',
                    path,
                    caption: null,
                    sort_order: 500 + i,
                    status: 'approved',
                },
                { onConflict: 'provider_id,source,source_ref' }
            );
            if (upsertErr) continue;
            savedCount += 1;
        } catch {
            // Ignore individual image failures
        }
    }

    const updatedAbout = about || provider.about || null;
    const updatedPast = past || provider.past_work || null;
    const narrative = [updatedAbout, updatedPast]
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .join('\n\n')
        .trim()
        .slice(0, 12_000);

    const nowIso = new Date().toISOString();
    await admin
        .from('providers')
        .update({
            about: typeof updatedAbout === 'string' && updatedAbout.trim() ? updatedAbout.trim() : null,
            past_work: typeof updatedPast === 'string' && updatedPast.trim() ? updatedPast.trim() : null,
            summary_long: narrative.length > 0 ? narrative : null,
            updated_at: nowIso,
        })
        .eq('id', provider.id);

    return {
        ok: true,
        provider_id: provider.id,
        website,
        about: updatedAbout,
        past_work: updatedPast,
        websiteText: text,
        images_found: images.length,
        images_saved: savedCount,
        analysis: {
            word_count: text.split(/\s+/).filter(Boolean).length,
            line_count: text.split('\n').filter((l) => l.trim().length > 0).length,
        },
    };
}

