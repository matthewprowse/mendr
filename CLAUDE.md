# Scandio — Project Brief

This file is read automatically by Claude, Cursor, and other AI coding assistants at the start of every session. Keep it accurate. Update it whenever the architecture, conventions, or key patterns change.

---

## What This Is

Scandio is an AI-powered home fault diagnosis product for Western Cape homeowners. A user photographs a fault, describes the problem, and the app produces a written diagnosis report — then connects them with vetted local contractors who can fix it.

The primary homeowner journey is:

```
/start  →  /diagnosis  →  /processing/[id]  →  /report/[id]  →  /match
```

Contractors have a separate onboarding and profile management flow under `/contractors/`.

---

## Tech Stack

| Concern              | Technology                                          |
|----------------------|-----------------------------------------------------|
| Framework            | Next.js 16, App Router, React 19                    |
| Language             | TypeScript 5 (strict mode)                          |
| Database & Auth      | Supabase (PostgreSQL + RLS + Auth)                  |
| AI / LLM             | Google Gemini via `@google/generative-ai` SDK       |
| Web Search           | Brave Search API (market rate research)             |
| Rate Limiting        | Upstash Redis in production, in-memory in dev/CI    |
| Styling              | Tailwind CSS + shadcn/ui primitives                 |
| Testing              | Vitest                                              |
| Deployment           | Vercel (serverless, edge where needed)              |
| Error Monitoring     | Sentry (`@sentry/nextjs`)                           |

---

## Where Things Live

```
src/
├── app/                    Next.js App Router — pages, layouts, API route handlers
│   ├── api/                Thin route handlers only. No business logic here.
│   │   ├── diagnose/       Core diagnosis pipeline entry point (route.ts)
│   │   ├── providers/      Provider search/match entry point (route.ts)
│   │   └── admin/          Admin-only endpoints (guarded by requireAdmin)
│   ├── chat/               Legacy streaming chat interface
│   ├── diagnosis/          Diagnosis upload + processing pages
│   ├── match/              Contractor match results page
│   ├── report/             Diagnosis report page
│   ├── contractors/        Contractor profile and onboarding pages
│   └── start/              Entry point — user describes their problem
│
├── features/               Self-contained business-logic slices
│   ├── diagnosis/          Diagnosis domain: types, agents, prompts, orchestrator
│   │   ├── types.ts        Canonical DiagnosisData type — import from here
│   │   ├── prompts/        All Gemini prompt files and prompt-changelog.md
│   │   ├── agent-classify.ts   Agent 2a: classification (trade, urgency, confidence)
│   │   ├── agent-prose.ts      Agent 2b: narrative fields (title, message, thought)
│   │   └── processing-orchestrator.ts  Step sequencing for /processing
│   └── match/              Match domain: provider hooks, filters, location
│
├── lib/                    Shared utilities used across multiple features
│   ├── ai/                 Gemini client, config, logging, cost tracking
│   ├── providers/          Provider business logic (ranking, persistence, enrichment)
│   ├── diagnosis/          Diagnosis utilities (parsing, display, taxonomy, stream)
│   ├── auth/               Supabase clients, admin auth, cron auth
│   ├── market-rates/       Market rate research (Brave + Gemini)
│   ├── parts-prices/       Spare parts price lookup (Brave + Gemini)
│   ├── certifications/     Contractor certification catalogue
│   └── (flat ~15 files)    rate-limit, safe-redirect, services, utils, etc.
│
└── components/             Shared UI components
    └── ui/                 shadcn/ui primitives — do not modify directly
```

---

## Naming Conventions

These are enforced conventions, not preferences. Deviating creates disambiguation failures.

| What                           | Convention               | Example                              |
|--------------------------------|--------------------------|--------------------------------------|
| All TypeScript/TSX files       | `kebab-case`             | `ai-cost-logger.ts`                  |
| Client component per route     | `client.tsx`             | `src/app/diagnosis/client.tsx`       |
| React hooks                    | `use-[name].ts`          | `use-match-map.ts`                   |
| API route files                | `route.ts` only          | `src/app/api/diagnose/route.ts`      |
| Canonical domain types         | `types.ts`               | `src/features/diagnosis/types.ts`    |
| Test files                     | `__tests__/[name].test.ts` | `__tests__/extract-price.test.ts`  |
| Supabase migrations            | `YYYYMMDDHHMMSS_desc.sql` | `20260512000000_atomic_quota.sql`   |

**Never** use camelCase file names (e.g. `useMatchMap.ts` — use `use-match-map.ts`).
**Never** use spaces in file names — they break Linux CI.
**Never** name a file the same as its parent directory (e.g. `constants/constants.ts`).

---

## Key Patterns

### Rate limiting
Every public API route must call `checkRateLimit` as its **first operation**:
```typescript
import { checkRateLimit } from '@/lib/rate-limit-config';

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'diagnose');
    if (limited) return limited;
    // ...
}
```
Bucket names are defined in `src/lib/rate-limit-config.ts`. Adding a new public route means adding a new bucket.

### Supabase client selection
- User-session operations → `createSupabaseServerClient` (from `@/lib/auth/supabase-server`)
- Admin / service-role operations → `createSupabaseAdminClient` (from `@/lib/auth/supabase-server`)
- Browser (client components) → `createBrowserClient` (from `@/lib/auth/supabase`)
- **Never** use the admin client in a client component.

### DiagnosisData type
The canonical type is `src/features/diagnosis/types.ts`. Always import from there:
```typescript
import type { DiagnosisData } from '@/features/diagnosis/types';
```
Do **not** import from `@/app/chat/components/types` — that re-exports from the canonical source and exists for backward compatibility only.

### Diagnosis parsing
There is one canonical parser:
```typescript
import { parseDiagnosisFromModelResponse } from '@/lib/diagnosis/parse-diagnosis-from-model-response';
```
Do **not** use `tryParseDiagnosisJson` from `@/lib/utils` directly.

### Admin route guard
```typescript
import { requireAdmin } from '@/lib/auth/admin-auth';

export async function GET(req: NextRequest) {
    const deny = await requireAdmin(req);
    if (deny) return deny;
    // ...
}
```

### Structured logging
```typescript
import { logPipelineStep } from '@/lib/ai/ai-logging';
import { logGeminiUsage } from '@/lib/ai/ai-cost-logger';
```
All pipeline steps must emit a `logPipelineStep` call. All Gemini calls must follow with `void logGeminiUsage(result.response.usageMetadata, ctx)`.

---

## Diagnosis Pipeline — Call Order

The `/api/diagnose` route runs this sequence on every request:

1. `checkRateLimit` — rejects excess requests before any work is done
2. `incrementDiagnosisQuota` — atomic DB quota check (Supabase RPC)
3. `runClassification` — Agent 2a in `features/diagnosis/agent-classify.ts`
4. `runProseGeneration` — Agent 2b in `features/diagnosis/agent-prose.ts`
5. `logGeminiUsage` — fire-and-forget cost log
6. `logPipelineStep` — structured timing log

Prompt system: `features/diagnosis/prompts/` — see `prompt-changelog.md` for history.
Prompt version: currently `v6.0` (see `features/diagnosis/prompts/prompt-version.ts`).

---

## What to Avoid

- **Do not add business logic to `app/api/` directories.** Route handlers are thin entry points. Business logic belongs in `lib/` or `features/`.
- **Do not add top-level files to `lib/` without a subdirectory.** Put new files in the relevant domain folder (`lib/ai/`, `lib/providers/`, etc.).
- **Do not import `DiagnosisData` from `@/app/chat/components/types`.** Use `@/features/diagnosis/types`.
- **Do not add `framer-motion` imports to hot-path routes** (`/processing`, `/diagnosis`, `/report`). Use CSS transitions instead.
- **Do not use `any` in catch clauses.** Use `unknown` and narrow explicitly.
- **Do not create barrel `index.ts` files in `lib/` subdirectories** unless the module has a clearly defined public surface. Prefer direct imports.
- **Do not use `console.log` in server-side code.** Use `logPipelineStep` or `console.error`/`console.warn` with structured JSON.

---

## Environment Variables (Required for Full Functionality)

| Variable                        | Purpose                                      |
|---------------------------------|----------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe)             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role (server-only)          |
| `GEMINI_API_KEY`                | Google Gemini API key                        |
| `BRAVE_SEARCH_API_KEY`          | Brave Search API key                         |
| `UPSTASH_REDIS_REST_URL`        | Upstash Redis URL (production rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN`      | Upstash Redis token                          |
| `NEXT_PUBLIC_SENTRY_DSN`        | Sentry DSN (enables error monitoring)        |
| `ADMIN_PASSWORD`                | Hashed password for admin dashboard access  |

---

*Last updated: May 2026. Owner: Matthew Prowse.*
