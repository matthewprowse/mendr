import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isOpenNowFromWeekdayDescriptions } from '@/lib/open-status';
import { parseWeekdayDescriptions } from '../_lib/hours';

export function useProProvider(placeId: string) {
    const isUuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        );

    const [providerName, setProviderName] = useState<string | null>(null);
    const [providerAddress, setProviderAddress] = useState<string | null>(null);
    const [providerLat, setProviderLat] = useState<number | null>(null);
    const [providerLng, setProviderLng] = useState<number | null>(null);
    const [providerSummary, setProviderSummary] = useState<string | null>(null);
    const [providerSummaryLong, setProviderSummaryLong] = useState<string | null>(null);
    const [providerPhone, setProviderPhone] = useState<string | null>(null);
    const [providerEmail, setProviderEmail] = useState<string | null>(null);
    const [providerWebsiteRaw, setProviderWebsiteRaw] = useState<string | null>(null);
    const [isOperatingHoursLoading, setIsOperatingHoursLoading] = useState(true);
    const [operatingHoursByDay, setOperatingHoursByDay] = useState<Record<string, string>>({});
    const [showAllOperatingHours, setShowAllOperatingHours] = useState(false);
    // R11: Enrichment display fields
    const [providerSpecialisations, setProviderSpecialisations] = useState<string[]>([]);
    const [providerServiceAreas, setProviderServiceAreas] = useState<string[]>([]);
    const [providerCertifications, setProviderCertifications] = useState<string[]>([]);
    const [providerHighlights, setProviderHighlights] = useState<string[]>([]);
    const [providerHonestNote, setProviderHonestNote] = useState<string | null>(null);
    const [providerYearsInBusiness, setProviderYearsInBusiness] = useState<number | null>(null);
    const [providerFounder, setProviderFounder] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!placeId) return;
            setIsOperatingHoursLoading(true);
            setOperatingHoursByDay({});
            setShowAllOperatingHours(false);
            try {
                let data: any = null;
                // Some deployments may lag behind schema updates; if extended fields
                // (about/past_work/summary_long) aren't present yet, Supabase/PostgREST
                // returns `400 Bad Request`. Retry with a minimal column set so the
                // page still loads.
                const selectBase =
                    'name, summary, weekday_descriptions, address, latitude, longitude, phone, website';
                const selectExtended =
                    'name, summary, summary_long, about, past_work, specialisations, service_areas, certifications, highlights, honest_note, years_in_business, founder_or_key_person, weekday_descriptions, address, latitude, longitude, phone, website';

                const fetchRow = async (select: string) => {
                    if (isUuid(placeId)) {
                        const { data: row, error } = await (supabase as any)
                            .from('providers')
                            .select(select)
                            .eq('id', placeId)
                            .maybeSingle();
                        if (error) throw error;
                        return row;
                    }

                    const googlePlaceId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
                    const { data: row, error } = await (supabase as any)
                        .from('providers')
                        .select(select)
                        .eq('google_place_id', googlePlaceId)
                        .maybeSingle();
                    if (error) throw error;
                    return row;
                };

                try {
                    data = await fetchRow(selectExtended);
                } catch {
                    data = await fetchRow(selectBase).catch(() => null);
                }
                if (cancelled) return;
                if (data) {
                    if (typeof data.name === 'string') setProviderName(data.name);
                    setProviderAddress(
                        typeof data.address === 'string' && data.address.trim() ? data.address.trim() : null
                    );
                    const lat = data.latitude;
                    const lng = data.longitude;
                    setProviderLat(typeof lat === 'number' && Number.isFinite(lat) ? lat : null);
                    setProviderLng(typeof lng === 'number' && Number.isFinite(lng) ? lng : null);
                    setProviderSummary(typeof data.summary === 'string' ? data.summary : null);
                    const long =
                        typeof data.summary_long === 'string' && data.summary_long.trim()
                            ? data.summary_long.trim()
                            : '';
                    const about = typeof data.about === 'string' && data.about.trim() ? data.about.trim() : '';
                    const past =
                        typeof data.past_work === 'string' && data.past_work.trim()
                            ? data.past_work.trim()
                            : '';
                    const fallbackLong =
                        typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : null;
                    const composed =
                        long || [about, past].filter(Boolean).join('\n\n') || fallbackLong;
                    setProviderSummaryLong(composed);
                    setProviderPhone(
                        typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null
                    );
                    setProviderEmail(null);
                    setProviderWebsiteRaw(
                        typeof data.website === 'string' && data.website.trim() ? data.website.trim() : null
                    );
                    setOperatingHoursByDay(parseWeekdayDescriptions(data.weekday_descriptions));
                    setShowAllOperatingHours(false);
                    // R11: Enrichment display fields
                    setProviderSpecialisations(Array.isArray(data.specialisations) ? (data.specialisations as string[]) : []);
                    setProviderServiceAreas(Array.isArray(data.service_areas) ? (data.service_areas as string[]) : []);
                    setProviderCertifications(Array.isArray(data.certifications) ? (data.certifications as string[]) : []);
                    setProviderHighlights(Array.isArray(data.highlights) ? (data.highlights as string[]) : []);
                    setProviderHonestNote(typeof data.honest_note === 'string' && data.honest_note.trim() ? data.honest_note.trim() : null);
                    setProviderYearsInBusiness(typeof data.years_in_business === 'number' ? data.years_in_business : null);
                    setProviderFounder(typeof data.founder_or_key_person === 'string' && data.founder_or_key_person.trim() ? data.founder_or_key_person.trim() : null);
                } else {
                    setProviderName(null);
                    setProviderAddress(null);
                    setProviderLat(null);
                    setProviderLng(null);
                    setProviderSummary(null);
                    setProviderSummaryLong(null);
                    setProviderPhone(null);
                    setProviderEmail(null);
                    setProviderWebsiteRaw(null);
                    setProviderSpecialisations([]);
                    setProviderServiceAreas([]);
                    setProviderCertifications([]);
                    setProviderHighlights([]);
                    setProviderHonestNote(null);
                    setProviderYearsInBusiness(null);
                    setProviderFounder(null);
                }
            } catch {
                // ignore
            } finally {
                if (!cancelled) setIsOperatingHoursLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [placeId]);

    const providerIsOpen = useMemo(() => {
        const weekdayDescriptions = Object.entries(operatingHoursByDay).map(
            ([day, hours]) => `${day}: ${hours}`
        );
        return weekdayDescriptions.length
            ? isOpenNowFromWeekdayDescriptions(weekdayDescriptions, new Date())
            : null;
    }, [operatingHoursByDay]);

    return {
        providerName,
        providerAddress,
        providerLat,
        providerLng,
        providerSummary,
        providerSummaryLong,
        providerPhone,
        providerEmail,
        providerWebsiteRaw,
        isOperatingHoursLoading,
        operatingHoursByDay,
        showAllOperatingHours,
        setShowAllOperatingHours,
        providerIsOpen,
        // R11: Enrichment display fields
        providerSpecialisations,
        providerServiceAreas,
        providerCertifications,
        providerHighlights,
        providerHonestNote,
        providerYearsInBusiness,
        providerFounder,
    };
}
