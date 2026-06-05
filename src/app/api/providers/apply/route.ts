// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    RESEND_API_KEY, RESEND_FROM, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit-config';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import { sendScandioEmail, confirmationEmail } from '@/lib/resend-mail';
import { getAppOrigin } from '@/lib/site-url';

const CONTRACTOR_TYPES = new Set(['individual', 'team', 'enterprise']);

type ApplyBody = {
    contractorType?: string;
    applicantGooglePlaceId?: string;
    kycDocuments?: {
        idDocument?: { path?: string; bucket?: string };
        selfie?: { path?: string; bucket?: string };
    };
    businessName?: string;
    contactPerson?: string;
    emailAddress?: string;
    address?: string;
    serviceAreas?: string;
    phone?: string;
    whatsappAvailable?: boolean;
    preferredContactChannel?: string;
    website?: string;
    trade?: string;
    specialisations?: string;
    foundedYear?: string;
    registrationNumber?: string;
    certifications?: string;
    highlights?: string;
    bio?: string;
    insuranceCover?: string;
    typicalResponseTime?: string;
    pricingModel?: string;
    calloutFee?: string;
    uploads?: Array<{ path?: string; bucket?: string; caption?: string | null }>;
    serviceAreaRadii?: Array<{
        address?: string;
        lat?: number;
        lng?: number;
        radiusKm?: number;
        source?: string;
    }>;
    /** POPIA / Privacy Policy consent — must be strict boolean true. */
    popiaConsent?: unknown;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
    const limited = await checkRateLimit(req, 'providerApply');
    if (limited) return limited;

    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const applicantIp = forwardedFor.split(',')[0]?.trim() || null;

    // Capture authenticated user if present (optional — applicants may not be signed in yet)
    let authenticatedUserId: string | null = null;
    try {
        const serverClient = await createSupabaseServerClient();
        const { data: { user } } = await serverClient.auth.getUser();
        authenticatedUserId = user?.id ?? null;
    } catch {
        // Non-fatal — unauthenticated applications are still valid
    }

    let body: ApplyBody | null = null;
    try {
        body = (await req.json().catch(() => null)) as ApplyBody | null;
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const contractorType =
        typeof body?.contractorType === 'string' ? body.contractorType.trim().toLowerCase() : '';
    const applicantGooglePlaceId =
        typeof body?.applicantGooglePlaceId === 'string' ? body.applicantGooglePlaceId.trim().slice(0, 512) : '';

    const businessName  = typeof body?.businessName  === 'string' ? body.businessName.trim()  : '';
    const contactPerson = typeof body?.contactPerson === 'string' ? body.contactPerson.trim() : '';
    const emailRaw      = typeof body?.emailAddress  === 'string' ? body.emailAddress.trim().toLowerCase() : '';
    const address       = typeof body?.address       === 'string' ? body.address.trim()       : '';
    const serviceAreas  = typeof body?.serviceAreas  === 'string' ? body.serviceAreas.trim()  : '';
    const phone         = typeof body?.phone         === 'string' ? body.phone.trim()         : '';
    const trade         = typeof body?.trade         === 'string' ? body.trade.trim()         : '';
    const specialisations = typeof body?.specialisations === 'string' ? body.specialisations.trim() : '';
    const foundedYearRaw  = typeof body?.foundedYear  === 'string' ? body.foundedYear.trim()  : '';

    // POPIA / Privacy Policy consent — must be strict boolean true.
    // We do NOT accept truthy non-booleans (e.g. "yes", 1) so that client-side
    // bugs that coerce the value do not silently bypass the consent gate.
    if (body?.popiaConsent !== true) {
        return NextResponse.json(
            { error: 'You must accept the Privacy Policy (POPIA consent) to submit an application.' },
            { status: 400 },
        );
    }

    if (!contractorType || !CONTRACTOR_TYPES.has(contractorType)) {
        return NextResponse.json({ error: 'Select whether you work as an individual, team, or enterprise.' }, { status: 400 });
    }
    if (!businessName || !contactPerson || !emailRaw || !address || !serviceAreas || !phone || !trade || !specialisations || !foundedYearRaw) {
        return NextResponse.json({ error: 'Missing required onboarding fields.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
        return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const foundedYear = foundedYearRaw ? parseInt(foundedYearRaw, 10) : null;

    const calloutFeeRaw = typeof body?.calloutFee === 'string' ? body.calloutFee.trim() : '';
    const calloutFee    = calloutFeeRaw ? parseInt(calloutFeeRaw, 10) : null;
    const preferredContactChannel =
        typeof body?.preferredContactChannel === 'string' ? body.preferredContactChannel.trim() || null : null;
    const insuranceCover =
        typeof body?.insuranceCover === 'string' ? body.insuranceCover.trim().slice(0, 280) || null : null;
    const typicalResponseTime =
        typeof body?.typicalResponseTime === 'string' ? body.typicalResponseTime.trim().slice(0, 64) || null : null;
    const pricingModel =
        typeof body?.pricingModel === 'string' ? body.pricingModel.trim().slice(0, 280) || null : null;

    const uploads = Array.isArray(body?.uploads)
        ? body.uploads
              .map((item) => ({
                  path:    typeof item?.path    === 'string' ? item.path    : '',
                  bucket:  typeof item?.bucket  === 'string' ? item.bucket  : 'gallery',
                  caption: typeof item?.caption === 'string' ? item.caption.trim() || null : null,
              }))
              .filter((item) => item.path.length > 0)
        : [];

    const serviceAreaRadii = Array.isArray(body?.serviceAreaRadii)
        ? body.serviceAreaRadii
              .map((item) => ({
                  address:   typeof item?.address  === 'string' ? item.address  : '',
                  lat:       typeof item?.lat      === 'number' ? item.lat      : null,
                  lng:       typeof item?.lng      === 'number' ? item.lng      : null,
                  radius_km: typeof item?.radiusKm === 'number' ? item.radiusKm : null,
                  source:    typeof item?.source   === 'string' ? item.source   : null,
              }))
              .filter((item) => item.address.length > 0)
        : [];

    try {
        const admin = await createSupabaseAdminClient();

        // ── Insert core fields (stable schema) ───────────────────────────────
        const kycRaw = body?.kycDocuments;
        const idPath = kycRaw && typeof kycRaw.idDocument?.path === 'string' ? kycRaw.idDocument.path.trim() : '';
        const idBucket = kycRaw && typeof kycRaw.idDocument?.bucket === 'string' ? kycRaw.idDocument.bucket.trim() : 'gallery';
        const selfiePath = kycRaw && typeof kycRaw.selfie?.path === 'string' ? kycRaw.selfie.path.trim() : '';
        const selfieBucket = kycRaw && typeof kycRaw.selfie?.bucket === 'string' ? kycRaw.selfie.bucket.trim() : 'gallery';
        const kyc_documents =
            idPath || selfiePath
                ? {
                      ...(idPath ? { idDocument: { path: idPath, bucket: idBucket } } : {}),
                      ...(selfiePath ? { selfie: { path: selfiePath, bucket: selfieBucket } } : {}),
                  }
                : null;

        const { data: inserted, error } = await admin
            .from('provider_applications')
            .insert({
                contractor_type:           contractorType,
                applicant_google_place_id: applicantGooglePlaceId || null,
                kyc_documents,
                business_name:       businessName,
                contact_name:        contactPerson,
                email:               emailRaw,
                address,
                areas:               serviceAreas,
                phone,
                whatsapp_available:  body?.whatsappAvailable === true,
                preferred_contact_channel: preferredContactChannel,
                website:             typeof body?.website === 'string' ? body.website.trim() || null : null,
                trade,
                trade_description:   specialisations,
                founded_year:        Number.isFinite(foundedYear) ? foundedYear : null,
                registration_number: typeof body?.registrationNumber === 'string' ? body.registrationNumber.trim() || null : null,
                certifications:      typeof body?.certifications === 'string' ? body.certifications.trim() || null : null,
                highlights:          typeof body?.highlights === 'string' ? body.highlights.trim() || null : null,
                about:               typeof body?.bio === 'string' ? body.bio.trim() || null : null,
                insurance_cover:           insuranceCover,
                typical_response_time:     typicalResponseTime,
                pricing_model:             pricingModel,
                callout_fee:               Number.isFinite(calloutFee) ? calloutFee : null,
                application_images:  uploads.length > 0 ? uploads : null,
                service_areas:       serviceAreaRadii.length > 0 ? serviceAreaRadii : null,
                applicant_ip:        applicantIp,
                user_id:             authenticatedUserId,
                status:              'new',
                // POPIA consent timestamp — generated server-side for the audit trail.
                // Never trust a client-supplied timestamp for this field.
                popia_consent_at:    new Date().toISOString(),
            })
            .select('id')
            .single();

        if (error || !inserted?.id) {
            console.error('provider_applications insert error:', error);
            return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
        }

        const applicationId = inserted.id as string;

        // ── Set pipeline initial state (best-effort — requires migration) ────
        // Silently skipped if the pipeline columns don't exist yet.
        void admin
            .from('provider_applications')
            .update({
                confirmation_email_status: 'pending',
                enrichment_status:         'queued',
                enrichment_queued_at:      new Date().toISOString(),
            })
            .eq('id', applicationId)
            .then(({ error: pipelineErr }) => {
                if (pipelineErr) console.warn('[apply] pipeline columns not yet migrated:', pipelineErr.message);
            });

        // ── Send confirmation email (Stage 1) ─────────────────────────────────
        const firstName = contactPerson.split(/\s+/)[0] ?? contactPerson;
        const { text: emailText, html: emailHtml } = confirmationEmail(firstName, businessName);

        const emailResult = await sendScandioEmail({
            to:      { email: emailRaw, name: contactPerson },
            subject: 'We received your Mendr application',
            text:    emailText,
            html:    emailHtml,
        });

        // Persist email delivery outcome — fire-and-forget the update (don't fail the request)
        const emailPatch = emailResult.ok
            ? {
                  confirmation_email_status:  'sent',
                  confirmation_email_sent_at: new Date().toISOString(),
                  confirmation_email_error:   null,
              }
            : {
                  confirmation_email_status: 'failed',
                  confirmation_email_error:  emailResult.error,
              };

        void admin
            .from('provider_applications')
            .update(emailPatch)
            .eq('id', applicationId)
            .then(({ error: patchErr }) => {
                if (patchErr) console.error('[apply] email status patch error:', patchErr);
            });

        if (!emailResult.ok) {
            console.error('[apply] confirmation email failed:', emailResult.error);
        }

        // ── Trigger enrichment immediately (fire-and-forget) ──────────────────
        // Don't wait — respond to the applicant right away. If this call fails
        // the cron will pick it up within 5 minutes anyway.
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
            void fetch(`${getAppOrigin()}/api/cron/process-provider-applications`, {
                method:  'POST',
                headers: { Authorization: `Bearer ${cronSecret}` },
            }).catch((err) => console.warn('[apply] enrichment trigger failed:', err));
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('provider apply error:', err);
        return NextResponse.json({ error: 'Failed to submit application.' }, { status: 500 });
    }
}
