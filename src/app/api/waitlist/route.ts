import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit-config';

const VALID_TRADES = [
    'Plumbing', 'Electrical', 'General Building', 'Painting', 'Roofing',
    'Tiling', 'Carpentry', 'Air Conditioning & HVAC', 'Waterproofing',
    'Pest Control', 'Locksmith', 'Appliance Repair', 'Solar & Energy',
    'Landscaping & Garden', 'Pool & Spa', 'Cleaning & Maintenance',
] as const;

const VALID_SOURCES = [
    'Instagram', 'Facebook', 'Google', 'Friend or colleague',
    'Contractor referral', 'Other',
] as const;

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'contractorWaitlist'); // dedicated bucket — 5/hr per IP
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const business_name = typeof body.business_name === 'string' ? body.business_name.trim() : null;
    const trade = typeof body.trade === 'string' ? body.trade.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const areas = typeof body.areas === 'string' ? body.areas.trim() : '';
    const founded_year = body.years_experience ? new Date().getFullYear() - Number(body.years_experience) : null;
    const message = typeof body.message === 'string' ? body.message.trim() || null : null;
    const source = typeof body.source === 'string' ? body.source.trim() : null;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!trade || !VALID_TRADES.includes(trade as any))
        return NextResponse.json({ error: 'Select a valid trade' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (!areas) return NextResponse.json({ error: 'Areas covered is required' }, { status: 400 });
    if (name.length > 120)
        return NextResponse.json({ error: 'Name too long' }, { status: 400 });
    if (areas.length > 500)
        return NextResponse.json({ error: 'Areas too long' }, { status: 400 });
    if (message && message.length > 2000)
        return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    if (founded_year !== null && (isNaN(founded_year) || founded_year < 1900 || founded_year > 2100))
        return NextResponse.json({ error: 'Invalid years of experience' }, { status: 400 });

    const admin = await createSupabaseAdminClient();

    // Legacy endpoint: keep it working, but store into provider_applications so we only have one intake table.
    const { error } = await admin.from('provider_applications').insert({
        business_name: business_name || name,
        contact_name: name,
        email,
        address: areas, // best-effort: we don't have structured address fields on this legacy payload
        areas,
        phone,
        website: null,
        trade,
        trade_description: message || '—',
        founded_year,
        team_size: null,
        registration_number: null,
        certifications: null,
        highlights: null,
        referral: source && VALID_SOURCES.includes(source as any) ? source : null,
        source: source && VALID_SOURCES.includes(source as any) ? source : null,
        status: 'new',
    });

    if (error) {
        if (error.code === '23505') {
            // Unique constraint on email — already applied.
            return NextResponse.json({ ok: true, duplicate: true });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
