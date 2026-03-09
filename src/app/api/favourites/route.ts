import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/** Check whether the authenticated user has favourited a provider */
export async function GET(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ favourited: false });
        }

        const { searchParams } = new URL(req.url);
        const providerId = searchParams.get('provider_id');
        const placeId = searchParams.get('place_id');
        const slug = searchParams.get('slug');

        if (!providerId && !placeId && !slug) {
            return NextResponse.json({ favourited: false });
        }

        let query = supabase
            .from('provider_favourites')
            .select('id')
            .eq('user_id', user.id);

        if (providerId) {
            query = query.eq('provider_id', providerId);
        } else if (placeId) {
            query = query.eq('place_id', placeId);
        } else if (slug) {
            query = query.eq('provider_profile_slug', slug);
        }

        const { data } = await query.maybeSingle();

        return NextResponse.json({ favourited: !!data });
    } catch (e) {
        console.error('Favourites GET error:', e);
        return NextResponse.json({ favourited: false });
    }
}

/** Add a favourite */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
        }

        const body = await req.json();
        const { provider_id, place_id, provider_profile_slug, provider_name } = body;

        if (!provider_id && !place_id && !provider_profile_slug) {
            return NextResponse.json({ error: 'Provider target is required.' }, { status: 400 });
        }

        const { error } = await supabase.from('provider_favourites').upsert(
            {
                user_id: user.id,
                provider_id: provider_id ?? null,
                place_id: place_id ?? null,
                provider_profile_slug: provider_profile_slug ?? null,
                provider_name: provider_name ?? null,
            },
            {
                onConflict: provider_id
                    ? 'user_id,provider_id'
                    : place_id
                      ? 'user_id,place_id'
                      : 'user_id,provider_profile_slug',
                ignoreDuplicates: true,
            }
        );

        if (error) {
            console.error('Favourite insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Favourites POST error:', e);
        return NextResponse.json({ error: 'Failed to save favourite.' }, { status: 500 });
    }
}

/** Remove a favourite */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
        }

        const body = await req.json();
        const { provider_id, place_id, provider_profile_slug } = body;

        if (!provider_id && !place_id && !provider_profile_slug) {
            return NextResponse.json({ error: 'Provider target is required.' }, { status: 400 });
        }

        let query = supabase
            .from('provider_favourites')
            .delete()
            .eq('user_id', user.id);

        if (provider_id) {
            query = query.eq('provider_id', provider_id);
        } else if (place_id) {
            query = query.eq('place_id', place_id);
        } else if (provider_profile_slug) {
            query = query.eq('provider_profile_slug', provider_profile_slug);
        }

        const { error } = await query;

        if (error) {
            console.error('Favourite delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('Favourites DELETE error:', e);
        return NextResponse.json({ error: 'Failed to remove favourite.' }, { status: 500 });
    }
}
