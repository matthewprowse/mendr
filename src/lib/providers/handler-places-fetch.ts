/**
 * Multi-page Places Text Search loop extracted from `handler.ts` in Phase 2.
 *
 * Encapsulates the initial search + subsequent paginated fetches with retail-
 * type filtering and duplicate detection. Returns the merged places list and
 * the routing summary indexed in lock-step.
 *
 * The route still handles transient-error conversion to 503/429 responses
 * directly because that requires returning early from the route — kept
 * inline to minimise behavioural changes during the Phase 2 extraction.
 */

import {
    fetchPlacesSearchText,
    isTransientPlacesHttpStatus,
    type PlacesFetchImpl,
} from './handler-places-client';
import {
    RETAIL_TYPES,
    TEXT_SEARCH_MAX_EXTRA_PAGES,
} from './constants';
import { getTargetPlacesCountByRadius } from './handler-distance';

export interface PerformPlacesSearchParams {
    apiKey: string;
    lat: number;
    lng: number;
    radius: number;
    searchQuery: string;
    pageToken?: string;
    fetchImpl?: PlacesFetchImpl;
}

export type PerformPlacesSearchResult =
    | {
          kind: 'ok';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          places: any[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          routingSummaries: any[];
          nextPageToken: string | null;
          textSearchExtraPagesFetched: number;
      }
    | {
          kind: 'error';
          status: number;
          errorText: string;
      };

/**
 * Run the Text Search request and follow up to TEXT_SEARCH_MAX_EXTRA_PAGES of
 * pagination until we've gathered enough places to satisfy the per-radius
 * target count. Retail types are filtered out.
 */
export async function performPlacesSearch(
    params: PerformPlacesSearchParams,
): Promise<PerformPlacesSearchResult> {
    const { apiKey, lat, lng, radius, searchQuery, pageToken, fetchImpl } = params;

    const baseBody: Record<string, unknown> = {
        textQuery: searchQuery,
        ...(pageToken ? { pageToken } : {}),
        routingParameters: {
            origin: { latitude: lat, longitude: lng },
        },
        locationBias: {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius,
            },
        },
        pageSize: 20,
    };

    const response = await fetchPlacesSearchText(apiKey, baseBody, fetchImpl);
    if (!response.ok) {
        const errorText = await response.text();
        if (isTransientPlacesHttpStatus(response.status)) {
            return { kind: 'error', status: response.status, errorText };
        }
        // Re-throw for the route to catch (matches legacy behaviour).
        throw new Error(`Google Places API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPlaces = (data.places || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRouting = (data.routingSummaries || []) as any[];

    // Drop retail stores.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered: { place: any; routing: any }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawPlaces.forEach((p: any, i: number) => {
        const types = (p.types || []) as string[];
        const hasRetailType = types.some((t: string) => RETAIL_TYPES.has(t));
        if (!hasRetailType) filtered.push({ place: p, routing: rawRouting[i] });
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let places: any[] = filtered.map((f) => f.place);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let routingSummaries: any[] = filtered.map((f) => f.routing);

    const seenPlaceIds = new Set<string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        places.map((p: any) => String(p?.id ?? '')),
    );
    let nextSearchToken = (data.nextPageToken as string | undefined) || null;
    let lastNextPageToken: string | null = nextSearchToken;
    let textSearchExtraPagesFetched = 0;
    const targetPlacesCount = getTargetPlacesCountByRadius(radius);

    while (
        nextSearchToken &&
        !pageToken &&
        textSearchExtraPagesFetched < TEXT_SEARCH_MAX_EXTRA_PAGES &&
        places.length < targetPlacesCount
    ) {
        textSearchExtraPagesFetched += 1;
        const responseMore = await fetchPlacesSearchText(
            apiKey,
            { ...baseBody, pageToken: nextSearchToken },
            fetchImpl,
        );
        if (!responseMore.ok) break;
        const dataMore = await responseMore.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawMore = (dataMore.places || []) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routeMore = (dataMore.routingSummaries || []) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawMore.forEach((p: any, i: number) => {
            const pid = String(p?.id ?? '');
            if (!pid || seenPlaceIds.has(pid)) return;
            const types = (p.types || []) as string[];
            const hasRetailType = types.some((t: string) => RETAIL_TYPES.has(t));
            if (hasRetailType) return;
            seenPlaceIds.add(pid);
            places.push(p);
            routingSummaries.push(routeMore[i] ?? {});
        });
        nextSearchToken = (dataMore.nextPageToken as string | undefined) || null;
        lastNextPageToken = dataMore.nextPageToken ?? null;
    }

    return {
        kind: 'ok',
        places,
        routingSummaries,
        nextPageToken: lastNextPageToken,
        textSearchExtraPagesFetched,
    };
}
