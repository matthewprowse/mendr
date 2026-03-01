# Provider Cache Scraper

Pre-populates `cached_providers` by searching the **whole Western Cape** (grid of cells) for each trade. Reduces Google/Gemini API calls when users search—similar to how Uber pre-warms place data.

## How it works

1. **Geographic coverage** – A grid of cells covering the entire Western Cape (see `scripts/config/scrape-areas.ts`: `getWesternCapeGrid()`). Each cell uses a 40 km radius with overlap so the province is fully covered.
2. **Trades** – Fetched from the Supabase `services` table (active rows only, by `sort_order`). Uses `search_query` for each service.
3. **For each area × trade** – Calls `/api/providers` (Google Places + AI enrichment).
4. **Results cached** – Saved to `cached_providers`; future user searches hit cache.
5. **Resumable** – Completed tasks are stored in the `scrape_task_done` table. If the script stops (crash, rate limit, Ctrl+C), run it again and it skips finished tasks and continues from where it left off.

## Run

```bash
# 1. Start the dev server (in one terminal)
npm run dev

# 2. Run the scraper (in another terminal)
npm run scrape-providers
```

## Options

| Env var | Description |
|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (required for trades) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Supabase key (required for trades) |
| `SCRAPE_BASE_URL` | API base URL (default: `http://localhost:3000`) |
| `SCRAPE_CONCURRENCY` | Number of requests in parallel (default: 8) – run fast within free-tier limits |
| `SCRAPE_DELAY_MS` | Extra delay between starting each request in ms (default: 0) – add if you hit rate limits |
| `SCRAPE_REQUEST_TIMEOUT_MS` | Timeout per request in ms (default: 120000) |
| `SCRAPE_DRY_RUN` | Set to `1` to log without calling API |

## Configuration

- **Areas** – By default the script uses a full Western Cape grid from `getWesternCapeGrid()` in `scripts/config/scrape-areas.ts`. You can change bounds, grid step, or cell radius there, or replace `SCRAPE_AREAS` with a custom list.
- **Trades** – Managed in Supabase: `services` table, `active = true`, ordered by `sort_order`. The scraper uses each row’s `search_query` for the provider search.
- **Progress** – Stored in Supabase table `scrape_task_done` (columns: `area_key`, `trade`, `completed_at`). To start from scratch, clear that table (or delete rows for a given run).

## Sync provider reviews

After populating the cache with `scrape-providers`, run `sync-provider-reviews` to fetch reviews (and opening hours) for every provider in `cached_providers`. Each provider is refreshed via Google Place Details; the app then displays up to 50 reviews per provider on the pro page and in chat.

**Note:** Google Places API returns a maximum of 5 reviews per place. The script ensures every cached provider has those stored; the UI is built to show up to 50 when available.

```bash
# With dev server running
npm run sync-provider-reviews
```

| Env var | Description |
|---------|-------------|
| `SYNC_BASE_URL` or `SCRAPE_BASE_URL` | API base URL (default: `http://localhost:3000`) |
| `SYNC_CONCURRENCY` | Parallel requests (default: 5) |
| `SYNC_DELAY_MS` | Delay between requests in ms (default: 200) |
| `SYNC_DRY_RUN` | Set to `1` to log place_ids without calling the API |
