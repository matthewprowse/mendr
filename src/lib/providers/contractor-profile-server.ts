/**
 * Server-side contractor profile for `/contractors/[id]` and `GET /api/providers/[id]`.
 * Same behaviour as the former inline route handler: Supabase admin, sanitisation,
 * LLM content guard on prose fields, leak-triggered enrich queue.
 */

import { createSupabaseAdminClient } from '@/lib/auth/supabase-server';
import {
    sanitizeProfileText,
    isLowSignalProfileText,
} from '@/lib/providers/provider-profile-clean';
import { sanitizeCustomerSummary } from '@/lib/providers/review-summary';
import { validateLlmContentSafe } from '@/lib/ai/llm-content-guard';
import { getOpenStatusTextFromWeekdayDescriptions } from '@/lib/providers/open-status';
import { getCertificationBySlug } from '@/lib/certifications/catalog';
import type {
    ContractorProfile,
    MatchProviderCertification,
    MatchProviderCompanySize,
    MatchProviderImage,
} from '@/features/match/contracts';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_GALLERY_THUMBS = 12;

const PROVIDER_SELECT = [
    'id',
    'google_place_id',
    'name',
    'address',
    'latitude',
    'longitude',
    'phone',
    'website',
    'rating',
    'rating_count',
    'summary',
    'summary_long',
    'about',
    'past_work',
    'specialisations',
    'highlights',
    'service_areas',
    'key_person',
    'weekday_descriptions',
    'company_size',
    'years_in_business',
    'profile_completeness',
].join(', ');

type ProviderRow = {
    id: string;
    google_place_id: string | null;
    name: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
    website: string | null;
    rating: number | null;
    rating_count: number | null;
    summary: string | null;
    summary_long: string | null;
    about: string | null;
    past_work: string | null;
    specialisations: string[] | null;
    highlights: string[] | null;
    service_areas: string[] | null;
    key_person: string | null;
    weekday_descriptions: string[] | null;
    company_size: string | null;
    years_in_business: number | null;
    profile_completeness: number | null;
};

type CertificationRow = {
    slug: string;
    label: string | null;
    issuer: string | null;
};

type ImageRow = {
    bucket: string | null;
    path: string | null;
    caption: string | null;
};

function normaliseGuardedText(value: string | null | undefined): string | null {
    const cleaned = sanitizeProfileText(value ?? '');
    if (!cleaned) return null;
    if (isLowSignalProfileText(cleaned)) return null;
    const verdict = validateLlmContentSafe(cleaned);
    if (!verdict.ok) return null;
    return cleaned;
}

function buildImageUrl(bucket: string | null, path: string | null): string | null {
    if (!path) return null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!supabaseUrl) return null;
    return `${supabaseUrl}/storage/v1/object/public/${bucket || 'gallery'}/${path}`;
}

function isValidCompanySize(value: string | null): MatchProviderCompanySize | null {
    if (value === 'solo' || value === 'small' || value === 'mid' || value === 'large') {
        return value;
    }
    return null;
}

async function triggerLeakRefresh(googlePlaceId: string | null, providerId: string): Promise<void> {
    if (!googlePlaceId && !providerId) return;
    const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.VERCEL_URL ||
        '';
    const origin = baseUrl ? (baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`) : '';
    if (!origin) return;
    try {
        await fetch(`${origin}/api/enrich/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                placeIds: googlePlaceId ? [googlePlaceId] : undefined,
                providerIds: !googlePlaceId ? [providerId] : undefined,
                priorityPlaceId: googlePlaceId ?? undefined,
                mode: 'full',
                reason: 'leak_detected',
            }),
        });
    } catch {
        // Fire-and-forget; the page still renders the gated copy.
    }
}

export type LoadContractorProfileResult =
    | { status: 'ok'; profile: ContractorProfile; leakDetected: boolean }
    | { status: 'not_found' }
    | { status: 'bad_request' }
    | { status: 'error'; message: string };

/**
 * @param id — Decoded route id or place id (same string passed to `/api/providers/[id]`).
 */
export async function loadContractorProfileById(id: string): Promise<LoadContractorProfileResult> {
    const trimmed = id.trim();
    if (!trimmed) {
        return { status: 'bad_request' };
    }

    try {
        const admin = await createSupabaseAdminClient();

        const isUuid = UUID_RE.test(trimmed);
        const googlePlaceCandidates = isUuid
            ? null
            : trimmed.startsWith('places/')
              ? [trimmed]
              : [`places/${trimmed}`, trimmed];

        let row: ProviderRow | null = null;
        if (isUuid) {
            const { data, error } = await admin
                .from('providers')
                .select(PROVIDER_SELECT)
                .eq('id', trimmed)
                .eq('is_active', true)
                .maybeSingle();
            if (error) throw error;
            row = (data as ProviderRow | null) ?? null;
        } else if (googlePlaceCandidates) {
            const { data, error } = await admin
                .from('providers')
                .select(PROVIDER_SELECT)
                .in('google_place_id', googlePlaceCandidates)
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            row = (data as ProviderRow | null) ?? null;
        }

        if (!row) {
            return { status: 'not_found' };
        }

        const providerId = row.id;
        const googlePlaceId = row.google_place_id ?? null;

        const [certsRes, imagesRes] = await Promise.all([
            admin
                .from('provider_certifications')
                .select('slug, label, issuer')
                .eq('provider_id', providerId),
            admin
                .from('provider_images')
                .select('bucket, path, caption')
                .eq('provider_id', providerId)
                .eq('status', 'approved')
                .order('sort_order', { ascending: true })
                .order('id', { ascending: true })
                .limit(MAX_GALLERY_THUMBS),
        ]);

        const certifications: MatchProviderCertification[] = ((certsRes.data ?? []) as CertificationRow[])
            .map((r) => {
                const catalog = getCertificationBySlug(r.slug);
                return {
                    slug: r.slug,
                    label: catalog?.label ?? r.label ?? r.slug,
                    short: catalog?.short,
                };
            })
            .filter((c) => Boolean(c.slug && c.label));

        const images: MatchProviderImage[] = [];
        for (const r of (imagesRes.data ?? []) as ImageRow[]) {
            const url = buildImageUrl(r.bucket, r.path);
            if (!url) continue;
            const trimmedCaption =
                typeof r.caption === 'string' && r.caption.trim() ? r.caption.trim() : null;
            const entry: MatchProviderImage = trimmedCaption ? { url, caption: trimmedCaption } : { url };
            images.push(entry);
        }

        const summarySanitised = normaliseGuardedText(row.summary);
        const summary = summarySanitised ? sanitizeCustomerSummary(summarySanitised) : '';
        const summaryLong = normaliseGuardedText(row.summary_long);
        const about = normaliseGuardedText(row.about);
        const pastWork = normaliseGuardedText(row.past_work);

        const rawProse = {
            summary: row.summary,
            summary_long: row.summary_long,
            about: row.about,
            past_work: row.past_work,
        };
        const cleanProse = {
            summary,
            summary_long: summaryLong ?? '',
            about: about ?? '',
            past_work: pastWork ?? '',
        };
        const leakedFields = (Object.keys(rawProse) as (keyof typeof rawProse)[]).filter((k) => {
            const had = (rawProse[k] ?? '').trim().length > 0;
            const kept = (cleanProse[k] ?? '').trim().length > 0;
            return had && !kept;
        });
        const leakDetected = leakedFields.length > 0;

        if (leakDetected) {
            try {
                console.warn(
                    JSON.stringify({
                        type: 'enrichment_leak_detected',
                        side: 'read',
                        provider_id: providerId,
                        place_id: googlePlaceId,
                        fields: leakedFields,
                    })
                );
            } catch {
                // ignore logging failures
            }
            void triggerLeakRefresh(googlePlaceId, providerId);
        }

        const weekdayDescriptions: string[] = Array.isArray(row.weekday_descriptions)
            ? (row.weekday_descriptions as unknown[]).filter(
                  (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
              )
            : [];
        const openStatus = getOpenStatusTextFromWeekdayDescriptions(weekdayDescriptions, new Date());

        const profile: ContractorProfile = {
            placeId: googlePlaceId ?? '',
            place_id: googlePlaceId ?? undefined,
            providerId,
            googlePlaceId,
            name: row.name?.trim() || 'Provider',
            address: row.address?.trim() || '',
            rating:
                typeof row.rating === 'number' && Number.isFinite(row.rating) ? row.rating : null,
            ratingCount:
                typeof row.rating_count === 'number' && Number.isFinite(row.rating_count)
                    ? Math.max(0, Math.trunc(row.rating_count))
                    : 0,
            latitude:
                typeof row.latitude === 'number' && Number.isFinite(row.latitude)
                    ? row.latitude
                    : null,
            longitude:
                typeof row.longitude === 'number' && Number.isFinite(row.longitude)
                    ? row.longitude
                    : null,
            distanceKm: null,
            durationText: '',
            website: row.website?.trim() || null,
            phone: row.phone?.trim() || null,
            summary,
            summaryMeta: null,
            services: undefined,
            scandioReviewCount: undefined,
            isOpen: openStatus.isOpen ?? null,
            weekdayDescriptions,
            bio: null,
            about,
            pastWork,
            summaryLong,
            keyPerson: row.key_person?.trim() || null,
            highlights: Array.isArray(row.highlights)
                ? (row.highlights as unknown[]).filter(
                      (h): h is string => typeof h === 'string' && h.trim().length > 0
                  )
                : [],
            serviceAreas: Array.isArray(row.service_areas)
                ? (row.service_areas as unknown[]).filter(
                      (s): s is string => typeof s === 'string' && s.trim().length > 0
                  )
                : [],
            specialisations: Array.isArray(row.specialisations)
                ? (row.specialisations as unknown[]).filter(
                      (s): s is string => typeof s === 'string' && s.trim().length > 0
                  )
                : [],
            hasWorkPhotos: images.length > 0,
            enrichmentReviewSummary: null,
            responseProfile: null,
            profileCompleteness:
                typeof row.profile_completeness === 'number' &&
                Number.isFinite(row.profile_completeness)
                    ? row.profile_completeness
                    : undefined,
            companySize: isValidCompanySize(row.company_size),
            yearsInBusiness:
                typeof row.years_in_business === 'number' && Number.isFinite(row.years_in_business)
                    ? row.years_in_business
                    : null,
            certifications,
            images,
            nextOpensAt: openStatus.nextOpensAt ?? null,
        };

        return { status: 'ok', profile, leakDetected };
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { status: 'error', message: msg };
    }
}
