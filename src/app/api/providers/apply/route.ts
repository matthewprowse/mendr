import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

type ApplyBody = {
    businessName?: string;
    contactPerson?: string;
    emailAddress?: string;
    address?: string;
    serviceAreas?: string;
    phone?: string;
    whatsappAvailable?: boolean;
    website?: string;
    trade?: string;
    specialisations?: string;
    foundedYear?: string;
    teamSize?: string;
    registrationNumber?: string;
    certifications?: string;
    highlights?: string;
    referralSource?: string;
    referralOther?: string;
    uploads?: Array<{ path?: string; bucket?: string; caption?: string | null }>;
    serviceAreaRadii?: Array<{
        address?: string;
        lat?: number;
        lng?: number;
        radiusKm?: number;
        source?: string;
    }>;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const applicantIp = forwardedFor.split(',')[0]?.trim() || null;

    let body: ApplyBody | null = null;
    try {
        body = (await req.json().catch(() => null)) as ApplyBody | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
    const contactPerson = typeof body?.contactPerson === 'string' ? body.contactPerson.trim() : '';
    const emailRaw = typeof body?.emailAddress === 'string' ? body.emailAddress.trim().toLowerCase() : '';
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const serviceAreas = typeof body?.serviceAreas === 'string' ? body.serviceAreas.trim() : '';
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const trade = typeof body?.trade === 'string' ? body.trade.trim() : '';
    const specialisations = typeof body?.specialisations === 'string' ? body.specialisations.trim() : '';
    const foundedYearRaw = typeof body?.foundedYear === 'string' ? body.foundedYear.trim() : '';

    if (!businessName || !contactPerson || !emailRaw || !address || !serviceAreas || !phone || !trade || !specialisations || !foundedYearRaw) {
        return NextResponse.json(
            {
                error:
                    'Missing required onboarding fields.',
            },
            { status: 400 }
        );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const teamRaw = typeof body?.teamSize === 'string' ? body.teamSize.trim() : '';
    const foundedYear = foundedYearRaw ? parseInt(foundedYearRaw, 10) : null;
    const teamSize = teamRaw ? parseInt(teamRaw, 10) : null;
    const uploads = Array.isArray(body?.uploads)
        ? body.uploads
              .map((item) => ({
                  path: typeof item?.path === 'string' ? item.path : '',
                  bucket: typeof item?.bucket === 'string' ? item.bucket : 'gallery',
                  caption: typeof item?.caption === 'string' ? item.caption.trim() || null : null,
              }))
              .filter((item) => item.path.length > 0)
        : [];
    const serviceAreaRadii = Array.isArray(body?.serviceAreaRadii)
        ? body.serviceAreaRadii
              .map((item) => ({
                  address: typeof item?.address === 'string' ? item.address : '',
                  lat: typeof item?.lat === 'number' ? item.lat : null,
                  lng: typeof item?.lng === 'number' ? item.lng : null,
                  radius_km: typeof item?.radiusKm === 'number' ? item.radiusKm : null,
                  source: typeof item?.source === 'string' ? item.source : null,
              }))
              .filter((item) => item.address.length > 0)
        : [];

    try {
        const admin = await createSupabaseAdminClient();
        const { error } = await admin.from('provider_applications').insert({
            business_name: businessName,
            contact_name: contactPerson,
            email: emailRaw,
            address,
            areas: serviceAreas,
            phone,
            whatsapp_available: body?.whatsappAvailable === true,
            website: typeof body?.website === 'string' ? body.website.trim() || null : null,
            trade,
            trade_description: specialisations,
            founded_year: Number.isFinite(foundedYear) ? foundedYear : null,
            team_size: Number.isFinite(teamSize) ? teamSize : null,
            registration_number:
                typeof body?.registrationNumber === 'string'
                    ? body.registrationNumber.trim() || null
                    : null,
            certifications:
                typeof body?.certifications === 'string' ? body.certifications.trim() || null : null,
            highlights: typeof body?.highlights === 'string' ? body.highlights.trim() || null : null,
            referral:
                typeof body?.referralSource === 'string'
                    ? body.referralSource.trim() === 'Other'
                        ? (typeof body?.referralOther === 'string' ? body.referralOther.trim() : 'Other') || 'Other'
                        : body.referralSource.trim()
                    : null,
            application_images: uploads.length > 0 ? uploads : null,
            service_areas: serviceAreaRadii.length > 0 ? serviceAreaRadii : null,
            applicant_ip: applicantIp,
            status: 'new',
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
