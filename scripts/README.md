# Provider Cache Scraper

Pre-populates `cached_providers` by searching defined areas for each trade type. Reduces Google/Gemini API calls when users search—similar to how Uber pre-warms place data.

## How it works

1. **Geographic cells** – `scripts/config/scrape-areas.ts` defines areas (lat, lng, radius in metres).
2. **Trades** – List of service types (plumber, electrician, etc.).
3. **For each area × trade** – Calls `/api/providers` (Google Places + AI enrichment).
4. **Results cached** – Saved to `cached_providers`; future user searches hit cache.

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
| `SCRAPE_BASE_URL` | API base URL (default: `http://localhost:3000`) |
| `SCRAPE_DELAY_MS` | Delay between requests in ms (default: 2000) – avoid rate limits |
| `SCRAPE_DRY_RUN` | Set to `1` to log without calling API |

## Add areas

Edit `scripts/config/scrape-areas.ts` – add entries to `SCRAPE_AREAS` and trades to `SCRAPE_TRADES`.
