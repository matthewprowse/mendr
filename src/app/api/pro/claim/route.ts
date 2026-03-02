import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * GET: Search cached_providers by name, area, or trade (services).
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q')?.trim() || '';
        const area = searchParams.get('area')?.trim() || '';
        const trade = searchParams.get('trade')?.trim() || '';

        let query = supabase
            .from('cached_providers')
            .select('place_id, id, name, address, rating, rating_count, services')
            .limit(20);

        if (q) {
            query = query.ilike('name', `%${q}%`);
        }
        if (area) {
            query = query.ilike('address', `%${area}%`);
        }

        const { data, error } = await query.order('name');
        if (error) {
            console.error('Claim search error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data ?? []);
    } catch (e) {
        console.error('Claim search error:', e);
        return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
    }
}

/**
 * POST: Claim a profile (create provider_profiles + optional verification/pricing/products).
 * Body: { place_id, base_callout_fee?, rate_per_km?, products?: [{ name, description?, price, unit }] }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { place_id, base_callout_fee, rate_per_km, products } = body;

        if (!place_id?.trim()) {
            return NextResponse.json({ error: 'place_id is required' }, { status: 400 });
        }

        const { data: cached } = await supabase
            .from('cached_providers')
            .select('place_id, name')
            .eq('place_id', place_id.trim())
            .single();

        if (!cached) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        // Ensure profiles row exists (id = user.id for provider_profiles FK)
        const { error: profileError } = await supabase.from('profiles').upsert(
            {
                id: user.id,
                user_id: user.id,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
        );

        if (profileError) {
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();
            if (!existing || existing.id !== user.id) {
                console.error('Profile upsert error:', profileError);
                return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
            }
        }

        const slugBase = cached.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

        const { error: insertError } = await supabase.from('provider_profiles').insert({
            id: user.id,
            slug,
            google_place_id: place_id.trim(),
            base_callout_fee: base_callout_fee != null ? Number(base_callout_fee) : null,
            rate_per_km: rate_per_km != null ? Number(rate_per_km) : null,
        });

        if (insertError) {
            if (insertError.code === '23505') {
                return NextResponse.json({ error: 'You have already claimed a profile' }, { status: 409 });
            }
            console.error('Provider profile insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        const productRows = Array.isArray(products)
            ? products
                  .slice(0, 10)
                  .filter((p: { name?: string; price?: number }) => p?.name && p?.price != null)
                  .map((p: { name: string; description?: string; price: number; unit?: string }, i: number) => ({
                      provider_id: user.id,
                      name: p.name,
                      description: p.description ?? null,
                      price: Number(p.price),
                      unit: p.unit ?? 'item',
                      sort_order: i,
                  }))
            : [];

        if (productRows.length > 0) {
            await supabase.from('provider_products').insert(productRows);
        }

        return NextResponse.json({ ok: true, slug });
    } catch (e) {
        console.error('Claim error:', e);
        return NextResponse.json({ error: 'Failed to claim profile' }, { status: 500 });
    }
}
