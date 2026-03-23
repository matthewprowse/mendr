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
    const [providerPhone, setProviderPhone] = useState<string | null>(null);
    const [providerEmail, setProviderEmail] = useState<string | null>(null);
    const [providerWebsiteRaw, setProviderWebsiteRaw] = useState<string | null>(null);
    const [isOperatingHoursLoading, setIsOperatingHoursLoading] = useState(true);
    const [operatingHoursByDay, setOperatingHoursByDay] = useState<Record<string, string>>({});
    const [showAllOperatingHours, setShowAllOperatingHours] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!placeId) return;
            setIsOperatingHoursLoading(true);
            setOperatingHoursByDay({});
            setShowAllOperatingHours(false);
            try {
                let data: any = null;
                if (isUuid(placeId)) {
                    const { data: row } = await (supabase as any)
                        .from('providers')
                        .select(
                            'name, summary, weekday_descriptions, address, latitude, longitude, phone, website'
                        )
                        .eq('id', placeId)
                        .maybeSingle();
                    data = row;
                } else {
                    const googlePlaceId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
                    const { data: row } = await (supabase as any)
                        .from('providers')
                        .select(
                            'name, summary, weekday_descriptions, address, latitude, longitude, phone, website'
                        )
                        .eq('google_place_id', googlePlaceId)
                        .maybeSingle();
                    data = row;
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
                    setProviderPhone(
                        typeof data.phone === 'string' && data.phone.trim() ? data.phone.trim() : null
                    );
                    setProviderEmail(null);
                    setProviderWebsiteRaw(
                        typeof data.website === 'string' && data.website.trim() ? data.website.trim() : null
                    );
                    setOperatingHoursByDay(parseWeekdayDescriptions(data.weekday_descriptions));
                    setShowAllOperatingHours(false);
                } else {
                    setProviderName(null);
                    setProviderAddress(null);
                    setProviderLat(null);
                    setProviderLng(null);
                    setProviderSummary(null);
                    setProviderPhone(null);
                    setProviderEmail(null);
                    setProviderWebsiteRaw(null);
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
        providerPhone,
        providerEmail,
        providerWebsiteRaw,
        isOperatingHoursLoading,
        operatingHoursByDay,
        showAllOperatingHours,
        setShowAllOperatingHours,
        providerIsOpen,
    };
}
