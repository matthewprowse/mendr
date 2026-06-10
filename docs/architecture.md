# Source Layout Conventions

Where code lives in `src/`, and the rules for deciding. Written during the
June 2026 cleanup — keep it updated when conventions change.

## Directories

### `src/app/` — routes only
Next.js App Router tree. Pages, layouts, API routes, and **route-local**
components/hooks/helpers that are used by exactly one route group.

- A route's interactive UI lives in a co-located `client.tsx` (or
  `components/` folder) next to its `page.tsx`.
- Route-local helpers go in a co-located `lib/` folder (e.g. `app/pro/lib/`,
  `app/account/lib/`) — **only** when used solely by that route group. The
  moment a second route group needs it, promote it to `src/lib/` or
  `src/components/`.
- If you convert a page to a `redirect()`, delete its old `client.tsx` and
  components in the same commit. (The June 2026 cleanup removed three stale
  clients left behind this way.)

### `src/components/` — shared UI
React components used by more than one route group.

- `components/ui/` — design-system primitives (shadcn-style, headless
  patterns). No app/domain logic.
- `components/` root and subfolders (`auth/`, `landing/`, `match/`…) —
  app-specific composites (e.g. `provider-document.tsx`, `auth/login-form.tsx`).
- `components/icons.tsx` — the app-wide icon re-export. All icons come from
  lucide-react (primary) or geist-icons via this module.

### `src/lib/` — building blocks
Pure functions, data-layer helpers, API clients, display/formatting
utilities. Server-safe unless the file is explicitly client-only. Organized
by domain (`lib/diagnosis/`, `lib/providers/`, `lib/whatsapp/`, …).

Rule of thumb: `lib/` code **does not orchestrate** — it's called by features
and routes, it doesn't call them.

### `src/features/` — domain orchestration
Multi-step domain modules: AI agents, pipelines, prompt definitions, and
their contracts (`features/diagnosis/`, `features/match/`, `features/home/`).

Boundary with `lib/`:
- Parses/builds **AI prompts or model responses** → `features/`
  (e.g. `features/diagnosis/parse-diagnosis-from-model-response.ts`,
  `diagnose-prompt-providers.ts` — both moved here from `lib/` in the cleanup).
- Generic display/format/cache helper that would work without the AI
  pipeline → `lib/`.

### Others
- `src/hooks/` — shared React hooks (`use-mobile`, …). Don't duplicate into `lib/`.
- `src/context/` — React contexts.
- `src/types/` — ambient `.d.ts` declarations only.
- `src/env.ts` — t3-env schema; imported by `next.config.ts` so validation
  runs at build/startup.

## Hygiene rules

- Generated output (perf reports, eval results) goes to gitignored paths
  (`tmp/`, `scripts/perf/reports/`) — never committed.
- Internal-only pages (`/design`, `/showcase`) must have `robots: noindex`
  metadata **and** an entry in `src/app/robots.ts`.
- Before adding a dependency, check an existing one doesn't already cover it
  (one icon set, one date lib, …). Remove deps when their last usage goes.
