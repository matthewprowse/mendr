import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const {
            lat,
            lng,
            trade,
            radius: customRadius,
            pageToken,
            searchQuery: providedSearchQuery,
        } = await req.json();
        let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
        try {
            supabase = await createSupabaseServerClient();
        } catch (e) {
            console.warn(
                'Supabase not configured — provider cache disabled:',
                (e as Error).message
            );
        }

        if (!lat || !lng || !trade) {
            return NextResponse.json(
                { error: 'Missing required parameters (lat, lng, trade)' },
                { status: 400 }
            );
        }
        if (pageToken && !providedSearchQuery) {
            return NextResponse.json(
                { error: 'searchQuery is required when using pageToken for pagination' },
                { status: 400 }
            );
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!geminiKey) {
            console.error('GEMINI_API_KEY is missing');
            throw new Error('Gemini API key is not configured');
        }

        if (!apiKey) {
            console.error('GOOGLE_PLACES_API_KEY is missing from environment variables');
            return NextResponse.json(
                { error: 'Google Places API key is not configured' },
                { status: 500 }
            );
        }

        console.log(
            `Using API Key starting with: ${apiKey.substring(0, 6)}... (Length: ${apiKey.length})`
        );

        const radius = customRadius || 50000; // Default 50km — wider search for rural/sparse areas

        // 1. Fast trade-to-query mapping (no AI call — saves ~1–2s)
        const TRADE_QUERY_MAP: Record<string, string> = {
            plumber: 'Plumber',
            plumbing: 'Plumber',
            'leaking pipe': 'Plumber',
            electrician: 'Electrician',
            electrical: 'Electrician',
            'gate technician': 'Gate Repair Service',
            'gate repair': 'Gate Repair Service',
            'gate motor': 'Gate Repair Service',
            roofing: 'Roofing Contractor',
            roofer: 'Roofing Contractor',
            guttering: 'Roofing Contractor',
            painter: 'Painter',
            painting: 'Painter',
            carpenter: 'Carpenter',
            handyman: 'Handyman',
            'air conditioning': 'AC Repair',
            'ac repair': 'AC Repair',
            locksmith: 'Locksmith',
            tiler: 'Tiler',
            paving: 'Paving Contractor',
            pool: 'Pool Service',
            'water damage': 'Water Damage Restoration',
            builder: 'Builder',
            contractor: 'Building Contractor',
            'domestic worker': 'Domestic Worker',
            'domestic workers': 'Domestic Worker',
            cleaner: 'Cleaning Service',
            cleaning: 'Cleaning Service',
            housekeeping: 'Cleaning Service',
            housekeeper: 'Cleaning Service',
            gardener: 'Gardener',
            gardening: 'Gardening Service',
        };
        let searchQuery = providedSearchQuery;
        if (!searchQuery) {
            const normalizedTrade = trade.toLowerCase().trim();
            searchQuery = TRADE_QUERY_MAP[normalizedTrade] || trade;
        }

        // 2. Fetch providers from Google Places API
        const url = `https://places.googleapis.com/v1/places:searchText`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.location,places.editorialSummary,places.types,places.reviews,routingSummaries,places.regularOpeningHours,nextPageToken',
            },
            body: JSON.stringify({
                textQuery: searchQuery,
                ...(pageToken && { pageToken }),
                routingParameters: {
                    origin: {
                        latitude: lat,
                        longitude: lng,
                    },
                },
                locationBias: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: radius,
                    },
                },
                pageSize: 10,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Google Places API Error Details: ${errorText}`);
            throw new Error(`Google Places API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const places = data.places || [];
        const routingSummaries = data.routingSummaries || [];
        if (places.length === 0) {
            return NextResponse.json({ providers: [] });
        }

        // 3. Caching Logic: Check which providers are already analyzed
        const placeIds = places.map((p: any) => p.id);
        let cachedData = [];
        if (supabase) {
            const { data } = await supabase
                .from('cached_providers')
                .select('*')
                .in('place_id', placeIds);
            cachedData = data || [];
        }

        const cachedMap = new Map(cachedData?.map((item) => [item.place_id, item]));
        const missingPlaces = places.filter((p: any) => !cachedMap.has(p.id));

        // 3. Use fallback for uncached — return fast; enrich in background for next request (saves ~2–4s)
        let aiResults: any[] = [];
        if (missingPlaces.length > 0 && geminiKey && supabase) {
            const providersContext = missingPlaces.map((place: any) => {
                const reviews =
                    place.reviews
                        ?.map((r: any) => ({ text: r.text?.text, rating: r.rating }))
                        .filter((r: any) => r.text)
                        .slice(0, 5) || [];
                return {
                    place_id: place.id,
                    name: place.displayName?.text || 'Unknown',
                    rating: place.rating,
                    rating_count: place.userRatingCount,
                    description: place.editorialSummary?.text || 'N/A',
                    reviews,
                };
            });
            void (async () => {
                try {
                    const genAI = new GoogleGenerativeAI(geminiKey);
                    const model = genAI.getGenerativeModel({
                        model: 'gemini-2.0-flash',
                        generationConfig: { temperature: 0.1 },
                    });
                    const batchPrompt = `Analyse these ${providersContext.length} home service providers. For each: 1) Title Case name. 2) "summary" (max 30 words, British English, from reviews). 3) "services" array: [{"short":"≤15 chars","full":"≤30 chars"}] for trade: ${trade}. Output JSON only: {"results":[{"place_id":"","name":"","summary":"","services":[]}]}. DATA: ${JSON.stringify(providersContext)}`;
                    const result = await model.generateContent(batchPrompt);
                    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        const results = parsed.results || [];
                        const adminSupabase = await createSupabaseAdminClient();
                        const toCache = results
                            .map((r: any) => {
                                const place = missingPlaces.find((p: any) => p.id === r.place_id);
                                return place
                                    ? {
                                          place_id: place.id,
                                          name: r.name || place.displayName?.text,
                                          address: place.formattedAddress || '',
                                          rating: place.rating,
                                          rating_count: place.userRatingCount ?? 0,
                                          phone: place.nationalPhoneNumber,
                                          website: place.websiteUri,
                                          latitude: place.location?.latitude,
                                          longitude: place.location?.longitude,
                                          summary:
                                              r.summary ||
                                              place.editorialSummary?.text ||
                                              `Local ${trade} professional.`,
                                          services: r.services || [],
                                      }
                                    : null;
                            })
                            .filter(Boolean);
                        if (toCache.length > 0)
                            await adminSupabase.from('cached_providers').upsert(toCache);
                    }
                } catch (e) {
                    console.warn('Background provider enrichment failed:', (e as Error).message);
                }
            })();
        }

        // 4. Map results back — use cache, aiResults (if we waited), or fallback for uncached
        const toCache: any[] = [];
        const processedProviders = places.map((place: any, index: number) => {
            const isCached = cachedMap.has(place.id);
            const aiData = isCached
                ? cachedMap.get(place.id)
                : aiResults.find((r: any) => r.place_id === place.id);

            // Safe address formatting
            const components = place.addressComponents || [];
            const getComponent = (type: string) =>
                components.find(
                    (c: any) => c.types && Array.isArray(c.types) && c.types.includes(type)
                )?.longText || '';

            const streetNumber = getComponent('street_number');
            const route = getComponent('route');
            const suburb = getComponent('sublocality_level_1') || getComponent('neighborhood');
            const town = getComponent('postal_town') || getComponent('locality');
            const county = getComponent('administrative_area_level_2');

            const shortAddress = [
                streetNumber && route ? `${streetNumber} ${route}` : route || '',
                suburb,
                town,
                county,
            ]
                .filter(Boolean)
                .join(', ');

            // Extract driving distance from routingSummaries (parallel array to places)
            let distanceText = '';
            const meters = routingSummaries[index]?.legs?.[0]?.distanceMeters;
            if (meters !== undefined) {
                distanceText = (meters / 1000).toFixed(1);
            }

            const weekdayDescriptions = place.regularOpeningHours?.weekdayDescriptions ?? [];
            const nextOpenTime = place.regularOpeningHours?.nextOpenTime ?? null;
            const providerData = {
                place_id: place.id,
                name: aiData?.name || place.displayName?.text || 'Unknown Provider',
                address: shortAddress || place.formattedAddress || 'Address not available',
                rating: place.rating,
                rating_count: place.userRatingCount,
                phone: place.nationalPhoneNumber,
                phoneInternational: place.internationalPhoneNumber,
                website: place.websiteUri,
                latitude: place.location?.latitude,
                longitude: place.location?.longitude,
                isOpen: place.regularOpeningHours?.openNow ?? null,
                weekdayDescriptions: weekdayDescriptions,
                nextOpenTime: nextOpenTime,
                summary:
                    aiData?.summary ||
                    place.editorialSummary?.text ||
                    `Local ${trade} professional.`,
                services:
                    aiData?.services ||
                    place.types
                        ?.filter(
                            (t: string) =>
                                !['point_of_interest', 'establishment', 'premise', 'map'].includes(
                                    t
                                )
                        )
                        .slice(0, 5)
                        .map((t: string) => ({ short: t.slice(0, 15), full: t })) ||
                    [],
                distanceText: distanceText,
            };

            // Add to batch cache update if it's new and we have AI data for it
            if (!isCached && aiData) {
                toCache.push(providerData);
            }

            return {
                ...providerData,
                distanceText, // Add driving distance to the final response
                ratingCount: providerData.rating_count, // Keep frontend compatibility
                isOpen: providerData.isOpen,
                weekdayDescriptions: providerData.weekdayDescriptions,
                nextOpenTime: providerData.nextOpenTime,
            };
        });

        // Batch update the cache in the background (don't await it to keep response fast)
        if (toCache.length > 0 && supabase) {
            createSupabaseAdminClient()
                .then((adminSupabase) => {
                    const dbToCache = toCache.map((p) => ({
                        place_id: p.place_id,
                        name: p.name,
                        address: p.address,
                        rating: p.rating,
                        rating_count: p.rating_count,
                        phone: p.phone,
                        website: p.website,
                        latitude: p.latitude,
                        longitude: p.longitude,
                        summary: p.summary,
                        services: p.services,
                    }));

                    return adminSupabase.from('cached_providers').upsert(dbToCache);
                })
                .then(({ error }) => {
                    if (error) console.error('Background cache update failed:', error);
                })
                .catch((e) => console.warn('Supabase cache update skipped:', (e as Error).message));
        }

        const withReviews = processedProviders.filter(
            (p: any) => (p.ratingCount ?? p.rating_count ?? 0) > 0
        );
        const filteredProviders = withReviews.length > 0 ? withReviews : processedProviders;
        const sorted = [...filteredProviders].sort(
            (a: any, b: any) =>
                (b.rating ?? 0) - (a.rating ?? 0) ||
                (b.ratingCount ?? b.rating_count ?? 0) - (a.ratingCount ?? a.rating_count ?? 0)
        );

        // Established: 25+ reviews — main recommended list only
        const established = sorted.filter((p: any) => (p.ratingCount ?? p.rating_count ?? 0) >= 25);
        // Emerging: <25 reviews but good rating — "newbie" section below
        const emerging = sorted.filter(
            (p: any) =>
                (p.ratingCount ?? p.rating_count ?? 0) > 0 &&
                (p.ratingCount ?? p.rating_count ?? 0) < 25 &&
                (p.rating ?? 0) >= 4.0
        );

        const establishedCount = established.length;
        const takeCount = Math.min(5, establishedCount);
        const providers = established.slice(0, takeCount);
        const emergingProviders = emerging.slice(0, 5);
        const nextPageToken = data.nextPageToken || null;

        // Fast heuristic for Scandio's Pick (no AI call — saves ~1–2s): open > 4.5+ & 25+ reviews > best by rating
        let recommendedProviderIndex = 0;
        let favouriteReason = '';
        if (providers.length > 0) {
            const meetsBar = (p: any) =>
                (p.rating ?? 0) >= 4.5 && (p.ratingCount ?? p.rating_count ?? 0) >= 25;
            const openAndMeets = providers.findIndex((p: any) => meetsBar(p) && p.isOpen === true);
            const anyMeets = providers.findIndex((p: any) => meetsBar(p));
            if (openAndMeets >= 0) recommendedProviderIndex = openAndMeets;
            else if (anyMeets >= 0) recommendedProviderIndex = anyMeets;
            const pick = providers[recommendedProviderIndex];
            if (pick) {
                const r = pick.rating ?? 0;
                const rc = pick.ratingCount ?? pick.rating_count ?? 0;
                const openLine =
                    pick.isOpen === true
                        ? "They're currently open, which can allow for an immediate fix if they're available."
                        : pick.weekdayDescriptions?.[0]
                          ? `They are not currently open (${pick.weekdayDescriptions[0]}).`
                          : 'They are not currently open.';
                favouriteReason = `We recommend ${pick.name}. ${openLine} With a ${r.toFixed(1)} rating and ${rc} review${rc === 1 ? '' : 's'}, they have a strong track record.`;
            }
        }

        // Mark the recommended provider and add reason
        const providersWithFavourite = providers.map((p: any, i: number) => ({
            ...p,
            isFavourite: i === recommendedProviderIndex,
            favouriteReason: i === recommendedProviderIndex ? favouriteReason : undefined,
        }));

        return NextResponse.json({
            providers: providersWithFavourite,
            emergingProviders,
            nextPageToken,
            searchQuery,
            recommendedProviderIndex,
        });
    } catch (error: any) {
        console.error('Places API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch providers' },
            { status: 500 }
        );
    }
}
