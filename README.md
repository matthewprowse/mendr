# Scandio

Home maintenance assistant — AI-powered image diagnosis and local provider discovery for homeowners and service professionals.

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

## Project Structure

```
app/
├── src/
│   ├── app/           # Next.js App Router (pages, API, layouts)
│   ├── components/    # Shared UI components
│   │   └── ui/        # shadcn primitives
│   ├── lib/           # Utilities, Supabase clients
│   ├── hooks/         # Custom hooks
│   └── context/       # React context providers
├── supabase/          # Schema, RLS
│   ├── tables.sql
│   └── rls.sql
└── docs/
```

## Coding Guidelines

See [docs/CODING_GUIDELINES.md](../docs/CODING_GUIDELINES.md) for naming, structure, TypeScript, and Supabase conventions.

## Deploy

Deploy to Vercel or any Node.js host. Ensure all environment variables are set in your deployment platform.
