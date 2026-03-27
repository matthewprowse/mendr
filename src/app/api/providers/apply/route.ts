import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

type ServiceArea = {
    id: string;
    location: { lat: number; lng: number; address: string };
    radiusKm: number;
};

type ApplyBody = {
    businessName?: string;
    contactName?: string;
    address?: string;
    phone?: string;
    website?: string;
    trade?: string;
    tradeDescription?: string;
    serviceAreas?: ServiceArea[];
    yearsExperience?: string;
    teamSize?: string;
    registrationNumber?: string;
    about?: string;
    referral?: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    let body: ApplyBody | null = null;
    try {
        body = (await req.json().catch(() => null)) as ApplyBody | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
    const contactName = typeof body?.contactName === 'string' ? body.contactName.trim() : '';
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const trade = typeof body?.trade === 'string' ? body.trade.trim() : '';
    const tradeDescription =
        typeof body?.tradeDescription === 'string' ? body.tradeDescription.trim() : '';

    if (!businessName || !contactName || !address || !phone || !trade || !tradeDescription) {
        return NextResponse.json(
            {
                error: 'businessName, contactName, address, phone, trade, and tradeDescription are required.',
            },
            { status: 400 }
        );
    }

    const serviceAreas = Array.isArray(body?.serviceAreas) ? body.serviceAreas : [];
    if (serviceAreas.length === 0) {
        return NextResponse.json(
            { error: 'At least one service area is required.' },
            { status: 400 }
        );
    }

    const yearsRaw = typeof body?.yearsExperience === 'string' ? body.yearsExperience.trim() : '';
    const teamRaw = typeof body?.teamSize === 'string' ? body.teamSize.trim() : '';
    const yearsExperience = yearsRaw ? parseInt(yearsRaw, 10) : null;
    const teamSize = teamRaw ? parseInt(teamRaw, 10) : null;

    // Normalise service areas to a clean serialisable shape.
    const serviceAreasJson = serviceAreas.map((area) => ({
        address: area.location?.address ?? '',
        lat: area.location?.lat ?? 0,
        lng: area.location?.lng ?? 0,
        radius_km: area.radiusKm ?? 0,
    }));

    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('provider_applications').insert({
            business_name: businessName,
            contact_name: contactName,
            address,
            phone,
            website: typeof body?.website === 'string' ? body.website.trim() || null : null,
            trade,
            trade_description: tradeDescription,
            service_areas: serviceAreasJson,
            years_experience: Number.isFinite(yearsExperience) ? yearsExperience : null,
            team_size: Number.isFinite(teamSize) ? teamSize : null,
            registration_number:
                typeof body?.registrationNumber === 'string'
                    ? body.registrationNumber.trim() || null
                    : null,
            about: typeof body?.about === 'string' ? body.about.trim() || null : null,
            referral: typeof body?.referral === 'string' ? body.referral.trim() || null : null,
        });

        if (error) {
            console.error('provider_applications insert error:', error);
            return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('provider apply error:', err);
        return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
    }
}
