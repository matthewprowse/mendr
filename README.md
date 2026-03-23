# Scandio

Home maintenance assistant — AI-powered image diagnosis and fast local provider suggestions for homeowners.

## Tech Stack

- **Next.js 16+** (App Router)
- **React 19+**
- **TypeScript** (strict mode)
- **Supabase** (auth, database, storage)
- **Tailwind CSS v4** + **shadcn/ui**
- **Geist** font family

## Prerequisites

- Node.js 18+
- Supabase account
- Google Cloud (Gemini API, Places API, Maps)

## Setup

1. Clone and install:

   ```bash
   cd app
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` with your keys (see [Environment Variables](#environment-variables)).

4. Run the Supabase schema (from project root or Supabase dashboard):

   ```bash
   # In order: tables first, then RLS
   psql $DATABASE_URL -f supabase/tables.sql
   psql $DATABASE_URL -f supabase/rls.sql
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable                       | Required | Description                    |
| ------------------------------ | -------- | ------------------------------ |
| `GEMINI_API_KEY`               | Yes      | Google AI Studio API key       |
| `GOOGLE_PLACES_API_KEY`        | Yes      | Google Places API key          |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | Yes | Maps embed / client key        |
| `NEXT_PUBLIC_SUPABASE_URL`     | Yes      | Supabase project URL           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Yes      | Supabase anonymous key         |
| `SUPABASE_SERVICE_ROLE_KEY`    | Yes      | Supabase service role (server) |

See `.env.example` for the full list. Never commit `.env` or `.env.local`.

## Scripts

| Script        | Description                    |
| ------------- | ------------------------------ |
| `npm run dev` | Start development server       |
| `npm run build` | Production build              |
| `npm run start` | Start production server       |
| `npm run lint` | Run ESLint                     |
| `npm run format` | Format code with Prettier    |
| `npm run format:check` | Check formatting         |

## MVP Product Shape

- **Landing page** (`/`): marketing copy plus a primary call-to-action that starts a new diagnosis.
- **Chat page** (`/chat/[id]`): single, anonymous chat experience (image + text) for diagnosis and provider suggestions.
- **APIs**:
  - `/api/diagnose` — streams AI diagnosis for the current conversation.
  - `/api/providers` — returns a fast, simplified list of nearby providers from Google Places.
  - `/api/geocode` — address → lat/lng (Western Cape only, with caching).
  - `/api/location` — approximate lat/lng from IP as a fallback.

There is no separate \"app\" or \"hub\" area in the MVP flow; auth can exist but is not required to use chat.

## Rate Limiting

To protect costs and abuse without forcing login, we use simple IP-based limits:

- `/api/diagnose`: 50 diagnosis requests per IP per 24 hours.
- `/api/geocode`: 30 geocode lookups per IP per 24 hours.
- `/api/location`: 20 IP-based location lookups per IP per 24 hours.

These limits are enforced in-memory per server instance via `app/src/lib/rate-limit.ts`. Tune the `max` values there as needed.

## Conventions

See `app/src/CONVENTIONS.md` for naming, structure, and commenting rules for this project.

## Deploy

Deploy to Vercel or any Node.js host. Ensure all environment variables are set in your deployment platform.
