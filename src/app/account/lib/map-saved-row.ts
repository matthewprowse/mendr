import type { SavedContractorRow } from '../client';

/**
 * Raw shape returned by:
 *   select('id, provider_id, providers ( id, name, phone, website, address, rating, rating_count, specialisations, is_active )')
 *
 * Supabase may return the joined `providers` relation as either a single object
 * or a 1-element array depending on the FK resolution. We accept both.
 */
export type RawSavedProviderJoin = {
    id: string | null;
    provider_id: string | null;
    providers:
        | {
              id: string | null;
              name: string | null;
              phone: string | null;
              website: string | null;
              address: string | null;
              rating: number | null;
              rating_count: number | null;
              specialisations: string[] | null;
              is_active: boolean | null;
          }
        | Array<{
              id: string | null;
              name: string | null;
              phone: string | null;
              website: string | null;
              address: string | null;
              rating: number | null;
              rating_count: number | null;
              specialisations: string[] | null;
              is_active: boolean | null;
          }>
        | null;
};

/**
 * Map a single saved_providers row (joined with providers) into a SavedContractorRow.
 * - Returns [] when there is no joined provider, or the provider is inactive.
 * - Returns a single-element array when the join produced a row.
 * Use with `flatMap` over the raw rows to skip nulls/inactive cleanly.
 */
export function mapSavedRow(row: RawSavedProviderJoin): SavedContractorRow[] {
    if (!row || !row.providers) return [];
    const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    if (!provider) return [];
    if (provider.is_active === false) return [];
    if (!provider.id) return [];
    if (!row.id) return [];

    return [
        {
            savedId: row.id,
            providerId: provider.id,
            name: provider.name ?? '',
            phone: provider.phone ?? null,
            email: null,
            website: provider.website ?? null,
            rating: typeof provider.rating === 'number' ? provider.rating : null,
            ratingCount: typeof provider.rating_count === 'number' ? provider.rating_count : 0,
            address: provider.address ?? '',
            services: Array.isArray(provider.specialisations) ? provider.specialisations : [],
        },
    ];
}
