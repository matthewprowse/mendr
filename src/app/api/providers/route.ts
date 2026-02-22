import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const { lat, lng, trade, radius: customRadius, pageToken, searchQuery: providedSearchQuery } = await req.json();
        const supabase = await createSupabaseServerClient();

        if (!lat || !lng || !trade) {
            return NextResponse.json({ error: 'Missing required parameters (lat, lng, trade)' }, { status: 400 });
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

        const radius = customRadius || 25000; // Default 25km

        const genAI = new GoogleGenerativeAI(geminiKey || '');
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
            },
        });

        // 1. Normalize the trade into a robust search query (skip when paginating—must reuse exact query)
        let searchQuery = providedSearchQuery || `${trade} service provider`;
        if (!providedSearchQuery) {
            try {
                const normalizationPrompt = `
Convert the following home maintenance trade/speciality into a single, highly effective Google Maps search query.
Focus on getting the most relevant business results.

Trade: ${trade}

Output ONLY the search query string. No quotes, no explanation.
Example Input: "Leaking Pipe/Plumbing" -> Output: Plumber
Example Input: "Gate Technician/Electrician" -> Output: Gate Repair Service
Example Input: "Roofing/Guttering" -> Output: Roofing Contractor`;

                const result = await model.generateContent(normalizationPrompt);
                const normalized = result.response.text().trim().replace(/["']/g, '');
                if (normalized && normalized.length > 2) {
                    searchQuery = normalized;
                }
            } catch (e) {
                console.error('Trade normalization failed, using fallback:', e);
            }
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

        let aiResults: any[] = [];
        if (missingPlaces.length > 0) {
            const providersContext = missingPlaces.map((place: any) => {
                const reviews =
                    place.reviews
                        ?.map((r: any) => ({
                            text: r.text?.text,
                            rating: r.rating,
                        }))
                        .filter((r: any) => r.text)
                        .slice(0, 5) || [];

                return {
                    place_id: place.id,
                    name: place.displayName?.text || 'Unknown',
                    rating: place.rating,
                    rating_count: place.userRatingCount,
                    description: place.editorialSummary?.text || 'N/A',
                    reviews: reviews,
                };
            });

            const batchPrompt = `
Analyse the following list of ${providersContext.length} home service providers.
For each provider, perform the following tasks:
1. Format the company name in Title Case (e.g. "Kin Electrical" instead of "kin electrical"). Keep acronyms like "DNSD" capitalised.
2. Provide a "Customer Summary" (max 30 words). 
   - This must be a balanced, honest overview of their reputation based on the individual reviews provided.
   - Mention both positives and negatives if they appear in the reviews.
   - CRITICAL: Weight the proportion of positive vs negative sentiment in your summary to accurately reflect the provided data. If most reviews are positive but there are common complaints, ensure those complaints are mentioned proportionally.
   - NEVER mention the numeric rating or "stars" in this text. Focus entirely on the feedback content.
   - DO NOT include the company name in the summary.
3. List 3–5 specific service categories/specialities they offer (e.g. "Boiler Repair"). Prefer 3 distinct services over 5 repetitive ones.

CRITICAL SERVICE RULES (for the "short" field):
- Service names MUST NOT exceed 15 characters in length.
- Use 1-2 word descriptions that are punchy and professional.
- If a word is too long to fit the 15-character limit, shorten it and append a full stop (e.g., "Maint.", "Install.", "Rep.", "Cert.").
- Ensure services are highly relevant to the trade: ${trade}.
- Aim for high quality and clarity while staying strictly within the 15-character limit.
- AVOID REPETITION: Do NOT list near-identical services (e.g. "Gate Repairs", "Gate Install.", "Gate Maint.", "Gate Mod." — these are all the same trade). Pick 3 meaningfully different specialities instead of 5 that say the same thing. Each service must add distinct value.

FORMAT FOR SERVICES:
Provide an object for each service with two fields:
- "short": The shortened name (max 15 chars, professional shortening).
- "full": The full, descriptive name of the service (max 30 chars).

CRITICAL: 
- Use British English.
- Output raw JSON ONLY. 
- FORMAT: {"results": [{"place_id": "...", "name": "...", "summary": "...", "services": [{"short": "...", "full": "..."}, ...]}, ...]}

DATA:
${JSON.stringify(providersContext, null, 2)}`;

            try {
                const result = await model.generateContent(batchPrompt);
                const responseText = result.response.text().trim();
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    aiResults = parsed.results || [];
                }
            } catch (e) {
                console.error('Batch AI processing failed:', e);
            }
        }

        // 4. Map results back and identify new data to cache
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

            const weekdayDescriptions =
                place.regularOpeningHours?.weekdayDescriptions ?? [];
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
        if (toCache.length > 0) {
            createSupabaseAdminClient().then((adminSupabase) => {
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

                adminSupabase
                    .from('cached_providers')
                    .upsert(dbToCache)
                    .then(({ error }) => {
                        if (error) console.error('Background cache update failed:', error);
                    });
            });
        }

        const withReviews = processedProviders.filter(
            (p: any) => (p.ratingCount ?? p.rating_count ?? 0) > 0
        );
        const filteredProviders =
            withReviews.length > 0 ? withReviews : processedProviders;
        const sorted = [...filteredProviders].sort(
            (a: any, b: any) =>
                (b.rating ?? 0) - (a.rating ?? 0) ||
                (b.ratingCount ?? b.rating_count ?? 0) - (a.ratingCount ?? a.rating_count ?? 0)
        );

        const count = sorted.length;
        const takeCount = Math.min(5, count); // 1 Scandio's Pick + 4 other recommendations
        const providers = sorted.slice(0, takeCount);
        const nextPageToken = data.nextPageToken || null;

        // AI selects the best "favourite" provider: ideally open, 4.5+ rating, 25+ reviews
        let recommendedProviderIndex = 0;
        let favouriteReason = '';
        if (providers.length > 0) {
            try {
                const pickPrompt = `You are selecting the single best service provider from this list for a home maintenance job.

CRITERIA (in order of priority):
1. Ideally OPEN NOW (isOpen: true) - this is a strong preference
2. Rating >= 4.5 stars
3. At least 25 reviews (ratingCount >= 25)

Pick the provider that best meets these criteria. If multiple qualify, prefer: open > higher rating > more reviews.
If NONE meet all criteria, pick the one that comes closest (e.g. 4.3 rating with 50 reviews beats 4.8 with 5 reviews).

Output a JSON object with:
- "recommended_index": <0-based index>
- "reason": A brief 3-5 sentence explanation of why you chose this provider. Use British English.

CRITICAL RULES FOR THE REASON:
- NEVER mention price, cost, or estimated costs. The app shows that separately.
- NEVER mention "minimum requirement", "25 reviews", or any internal criteria. Instead say they have "many reviews", "a substantial review count", or similar.
- If they're open: say they're "currently open" and that this "can allow for an immediate resolution or fix if they're available". Do NOT say it's "our top priority".
- If they're NOT open (isOpen: false): you MUST include when they open next. Prefer nextOpenTime (RFC 3339 timestamp like "2025-02-24T08:00:00Z") if provided - convert to a readable time (e.g. "Opens Monday at 8am", "Opens tomorrow at 9am"). Otherwise use weekdayDescriptions (e.g. "Monday: 8am–5pm").

Example (open): "We recommend [Name]. They're currently open, which can allow for an immediate fix if they're available. With a 4.9 rating and over 40 reviews, they have a strong track record."
Example (closed): "We recommend [Name]. They are not currently open but open Monday at 8am. With a 4.9 rating and over 40 reviews, they have a strong track record."`;

                const providerList = providers.map((p: any, i: number) => ({
                    index: i,
                    name: p.name,
                    rating: p.rating ?? 0,
                    ratingCount: p.ratingCount ?? p.rating_count ?? 0,
                    isOpen: p.isOpen,
                    weekdayDescriptions: p.weekdayDescriptions ?? [],
                    nextOpenTime: p.nextOpenTime ?? null,
                }));

                const pickResult = await model.generateContent(`${pickPrompt}\n\nDATA:\n${JSON.stringify(providerList, null, 2)}`);
                const pickText = pickResult.response.text().trim();
                const pickMatch = pickText.match(/\{[\s\S]*\}/);
                if (pickMatch) {
                    const parsed = JSON.parse(pickMatch[0]);
                    const idx = parsed.recommended_index;
                    if (typeof idx === 'number' && idx >= 0 && idx < providers.length) {
                        recommendedProviderIndex = idx;
                        favouriteReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
                    }
                }
            } catch (e) {
                console.error('Favourite provider selection failed:', e);
                // Fallback: prefer open + 4.5+ + 25+ reviews; else best by rating/reviews
                const meetsBar = (p: any) =>
                    (p.rating ?? 0) >= 4.5 && (p.ratingCount ?? p.rating_count ?? 0) >= 25;
                const openAndMeets = providers.findIndex((p: any) => meetsBar(p) && p.isOpen === true);
                const anyMeets = providers.findIndex((p: any) => meetsBar(p));
                if (openAndMeets >= 0) recommendedProviderIndex = openAndMeets;
                else if (anyMeets >= 0) recommendedProviderIndex = anyMeets;
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
