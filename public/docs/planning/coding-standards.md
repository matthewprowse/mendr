# Coding Standards and Conventions

This document defines how code must be written, organised, and commented in this project. It is authoritative — not aspirational. Every rule here exists because violating it either causes bugs, increases the cost of future changes, or makes the codebase harder to work in with AI-assisted tooling.

The target audience is anyone writing or reviewing code in this repository, including AI coding assistants. The document is intentionally written in plain, direct language. Rules are prescriptive: "must", "never", and "always" mean exactly that.

---

## 1. Governing Principles

**Correctness before cleverness.** A function that is obviously correct is worth more than a function that is cleverly concise. When there is tension between the two, choose correctness.

**Explicit over implicit.** Every dependency, side effect, and precondition must be visible at the call site or stated in a JSDoc block. Code that relies on undocumented global state or implicit ordering is a maintenance liability.

**Minimise cognitive surface area.** A developer — or an AI model — should be able to understand what a file does by reading its exports and their JSDoc blocks, without reading every line of implementation. This is the single most important property for long-term AI-assisted development. It reduces token cost, reduces hallucination risk, and makes reviews faster.

**Fail loudly.** Missing environment variables, type mismatches, and unexpected states must produce clear, immediate errors. A failure that is silent at the point of occurrence will surface as a confusing bug somewhere else, at the worst possible time.

**Keep the dependency graph shallow.** Circular dependencies, deep import chains, and modules that know too much about their neighbours all make the codebase harder to refactor and harder for AI tools to reason about in isolation. Every import is a coupling. Couplings have a cost.

---

## 2. Project Structure

The folder structure below is the law. New files must go in the correct location. Moving an existing file into the correct location is always a worthwhile change.

```
src/
├── app/                        Next.js App Router — pages, layouts, route handlers
│   ├── api/                    Server-only route handlers
│   │   ├── admin/              Admin endpoints, guarded by requireAdmin
│   │   ├── diagnose/           Core AI diagnosis pipeline
│   │   └── [domain]/           One folder per API domain
│   └── [route]/                Page routes — one folder per URL segment
│       ├── page.tsx            Server Component: auth, data fetch, metadata
│       ├── client.tsx          Client Component: state, events, browser APIs
│       ├── components/         Components private to this route
│       └── hooks/              Hooks private to this route
│
├── features/                   Self-contained business logic slices
│   ├── diagnosis/              Diagnosis domain — types, orchestration
│   │   └── types.ts            Canonical type definitions for this feature
│   └── match/                  Contractor matching domain
│
├── lib/                        Shared utilities used across multiple features
│   ├── ai-client.ts            Gemini SDK initialisation and model factory
│   ├── ai-logging.ts           Structured logging for pipeline events
│   ├── ai-cost-logger.ts       Token-count logging and Gemini cost estimation
│   ├── rate-limit.ts           Rate limiting (in-memory fallback + Upstash Redis)
│   ├── rate-limit-config.ts    Rate limit bucket definitions and checkRateLimit
│   ├── supabase.ts             Browser-side Supabase client (anon key)
│   └── supabase-server.ts      Server-side Supabase clients (anon + admin)
│
└── components/                 Shared UI components used across routes
    └── ui/                     shadcn/ui primitives (Button, Input, Dialog, etc.)
```

### Rules that must be followed

`app/api/` files are server-only entry points. They must never be imported by client components, and they must never be imported by `lib/` modules. Route handlers call lib functions; lib functions do not call route handlers.

`features/` owns the canonical type definitions for each domain. Other parts of the codebase import types from the feature's `types.ts`. Do not redefine the same interface in multiple places.

`lib/` contains only genuinely shared code. If a utility is called by exactly one feature, it belongs inside that feature's folder, not in `lib/`.

`components/` contains only presentational code. No data fetching, no Supabase calls, no business logic. Components receive data through props and communicate through callbacks.

There must be no barrel `index.ts` files in `lib/` or `features/`. They obscure the dependency graph from both tools and humans. Import directly from the specific file.

---

## 3. File Naming

All file names use `kebab-case`. This is the Next.js convention and the Node.js convention, and it is the only option that works correctly across case-sensitive Linux file systems (the environment the app runs in on Vercel). macOS file systems are case-insensitive, which means a naming error that compiles locally will fail in CI and in production.

| Type                                | Naming convention                    | Example                                  |
|-------------------------------------|--------------------------------------|------------------------------------------|
| TypeScript utility or library file  | `kebab-case.ts`                      | `ai-cost-logger.ts`                      |
| Next.js reserved file               | As required by Next.js               | `page.tsx`, `layout.tsx`, `route.ts`     |
| Client component (stateful)         | `client.tsx`                         | `src/app/diagnosis/client.tsx`           |
| Shared React component              | `kebab-case.tsx`                     | `src/components/ui/button.tsx`           |
| Custom hook                         | `use-kebab-case.ts`                  | `use-match-map.ts`                       |
| Type definition file                | `types.ts`                           | `src/features/diagnosis/types.ts`        |
| Test file                           | `[module-name].test.ts(x)`           | `extract-price.test.ts`                  |
| Supabase migration                  | `YYYYMMDDHHMMSS_description.sql`     | `20260512000000_atomic_quota.sql`        |
| Planning and documentation          | `kebab-case.md`                      | `coding-standards.md`                    |

Spaces in file names are never permitted. A space in a file name will break Linux CI and produce errors in path-sensitive tooling.

camelCase file names (e.g. `useMatchMap.ts`) are legacy artefacts from an earlier phase of the project and must be removed when encountered. If a camelCase file and a kebab-case file of the same name coexist, the camelCase file is the orphan — delete it after confirming it has no active imports.

---

## 4. Formatting and Style

The project enforces formatting with Prettier and linting with ESLint. These tools are not optional style preferences — they are part of the build. Code that fails the formatter check must not be merged.

**Run the formatter before committing:**
```
npm run format
npm run lint
```

The canonical rules are:

- 4-space indentation for all TypeScript and TSX files
- 2-space indentation for JSON, YAML, and configuration files (this is the Prettier default for these types)
- Single quotes for string literals in TypeScript
- Trailing commas on all multi-line objects, arrays, and function parameter lists
- Semicolons are required — always
- Maximum line length is 120 characters; break earlier when it improves readability
- Opening braces on the same line as the statement (`if (x) {`, not `if (x)\n{`)

When the formatter and a stylistic preference conflict, the formatter wins, every time. Consistency across the codebase is more valuable than any individual preference.

---

## 5. TypeScript

The TypeScript compiler is configured with `strict: true`. This enables a family of checks — `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and others — that catch real bugs at compile time. These checks must remain enabled. Do not add `// @ts-ignore` or `// @ts-nocheck` to work around them. If the compiler is complaining, the code has a problem.

### Types and interfaces

Use `interface` for object shapes that represent a domain concept, particularly when they may be extended or implemented:

```typescript
// A domain entity — use interface. It can be extended if the shape evolves.
interface Contractor {
    id: string;
    tradeName: string;
    verified: boolean;
}
```

Use `type` for unions, intersections, mapped types, conditional types, and aliases for primitive combinations:

```typescript
// A union of string literals — use type.
type PipelineStepName = 'agent-classify' | 'agent-prose' | 'stream-complete';

// An intersection — use type.
type AuthenticatedRequest = NextRequest & { userId: string };
```

### Avoid `any`

`any` disables the type checker and defeats the purpose of TypeScript. It must not appear in new code. Where third-party types are genuinely incomplete, use `unknown` and narrow the type explicitly:

```typescript
// Correct: unknown forces you to check the shape before using it.
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agent-classify] generateContent threw', message);
}

// Wrong: any silently disables all type checking for this value.
} catch (err: any) {
    console.error(err.message); // no guarantee .message exists
}
```

The only acceptable use of `as SomeType` type assertions is at the boundary with libraries that return insufficiently-typed results (e.g. Gemini response schema fields). Even there, assert to a specific named interface, never to `any`.

### Discriminated unions over boolean flags

When a value can be in one of several distinct states, a discriminated union makes those states explicit and exhaustive. Boolean flags multiplied across a type create silent combinations that are never valid:

```typescript
// Wrong: two booleans create four combinations, three of which may be invalid.
interface RequestState {
    loading: boolean;
    error: boolean;
    data: DiagnosisData | null;
}

// Correct: the three valid states are explicit. The type checker enforces exhaustiveness.
type RequestState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: DiagnosisData };
```

### Exports

Named exports are required for all modules in `lib/` and `features/`. Default exports are permitted only for React components in `components/` and for Next.js reserved files (`page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, `loading.tsx`).

Default exports in utility modules make the imported name arbitrary, which breaks `grep`-based search and makes AI-assisted refactoring less reliable.

### Import organisation

Imports must be grouped in the following order, with a blank line between each group:

1. External packages (`react`, `next/server`, `@supabase/ssr`, `@google/generative-ai`)
2. Internal absolute imports via the `@/` alias (`@/lib/...`, `@/features/...`, `@/components/...`)
3. Relative imports (`./prompts`, `../types`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { checkRateLimit } from '@/lib/rate-limit-config';
import { logPipelineStep } from '@/lib/ai-logging';
import type { DiagnosisData } from '@/features/diagnosis/types';

import { buildSystemInstruction } from './prompts';
import type { ClassificationResult } from './agent-classify';
```

Use `import type` for any import that is only needed at compile time. This reduces bundle size and makes the dependency graph clearer.

### Constants

Module-level constants use `SCREAMING_SNAKE_CASE` regardless of whether they are exported:

```typescript
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const GEMINI_MODEL_NAME = 'gemini-2.5-flash' as const;
```

Use `as const` on string literal constants. This narrows the type from `string` to the specific literal, which is important when the value is used in discriminated unions or as an index key.

### Environment variables

Environment variables must be validated at the call site of the function that uses them, not at module load time. Validating at module load throws during `next build`, which produces a misleading error unrelated to the actual missing configuration.

```typescript
// Correct: validation happens when the function is called, which is when the variable is needed.
export async function createSupabaseAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'createSupabaseAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
        );
    }
    // ...
}

// Wrong: throws at build time with a confusing error if the variable is not set during the build.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
```

---

## 6. Functions

### Size and single responsibility

A function must do one thing. If you cannot describe a function's purpose in a single sentence without using "and", it is doing too much. Extract the second concern into a named helper.

Functions longer than approximately 60 lines are a signal to refactor. There is no hard limit, because some functions are legitimately complex, but the default assumption when a function grows past this point is that extraction is warranted.

### JSDoc on every exported function

Every exported function must have a JSDoc block. This is not optional and it is not a nice-to-have — it is the primary mechanism by which the codebase stays navigable as it grows, and it is the single most important thing you can do to reduce the cost of AI-assisted development.

The JSDoc block for an exported function must answer four questions:

1. What does this function do? (one sentence, written as an instruction: "Returns...", "Inserts...", "Applies...")
2. What are its external dependencies? (Supabase, Gemini, Redis, env vars, browser APIs)
3. Who calls it, or what flow does it participate in?
4. What are the non-obvious behaviours of its parameters or return value?

```typescript
/**
 * Apply a named rate limit bucket to an incoming request and return a 429
 * response if the caller is over the limit, or null if the request may proceed.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * are set; falls back to a process-local in-memory store for development and CI.
 * The in-memory fallback is not suitable for production — each serverless instance
 * maintains its own counter, so limits are not enforced across instances.
 *
 * Called by every public-facing API route handler as the first guard, before
 * any authentication or business logic.
 *
 * @param req     The incoming Next.js request — used to extract the caller IP.
 * @param bucket  A bucket key from RATE_LIMITS in rate-limit-config.ts.
 * @returns       A 429 NextResponse if the caller is rate-limited, otherwise null.
 */
export async function checkRateLimit(
    req: NextRequest,
    bucket: RateLimitBucket,
): Promise<NextResponse | null> {
```

### Internal helper functions

Private functions within a file need a one-line comment that explains their purpose when the name alone does not make it obvious. The bar for "obvious" is: would a new developer, or an AI assistant seeing only this function's signature, know what it does without reading the body?

```typescript
// Strips revision suffixes like '-001' or '-exp-0205' so we can match against
// the pricing table, which keys on the base model name only.
function resolveModelPricingKey(modelName: string): string {
    return Object.keys(PRICING).find((k) => modelName.startsWith(k)) ?? '';
}
```

### Naming

Function names must express business intent, not implementation mechanism. An AI model reading a call site should know from the name what the function does, without needing to jump to its definition.

```typescript
// The name expresses what it means in the domain.
await incrementDiagnosisQuota(userId, today);
await logGeminiUsage(result.response.usageMetadata, ctx);
await checkRateLimit(req, 'diagnose');

// These names describe the database operation, not the business intent.
await upsertUsageRow(userId, today);      // what does "usage row" mean to a new reader?
await insertCostRow(meta);                // cost of what?
```

### Async and fire-and-forget

When a side effect — logging, analytics, a cache write — must not block the response, mark the intentionally un-awaited call with `void`. This makes the omission of `await` deliberate and visible, rather than a mistake:

```typescript
// The void makes clear this is a fire-and-forget — the result does not matter here.
void logGeminiUsage(result.response.usageMetadata, ctx);

// Without void, this looks like a forgotten await. Linters will flag it.
logGeminiUsage(result.response.usageMetadata, ctx);
```

---

## 7. Comments

Comments are for things the code cannot say. They explain why a decision was made, what constraint is being worked around, or what non-obvious invariant must hold. They do not describe what the code mechanically does — the code already does that.

### What comments must do

A good comment is one that a new engineer (or an AI assistant) could not have written by reading only the code around it. It captures intent, context, and reasoning that lives outside the code itself.

```typescript
// 'unsafe-inline' cannot be removed here. Next.js 16 injects inline hydration scripts
// that have no nonce attribute, so a strict script-src policy that omits 'unsafe-inline'
// will break the page in production. The path to removing this is nonce-based middleware,
// tracked in the launch checklist under Phase 2 — Content Security Policy.
"script-src 'self' 'unsafe-inline' https://maps.googleapis.com",
```

```typescript
// The quota check is an atomic database function, not a read-then-write. Two concurrent
// requests hitting a read-then-write pattern would both pass the check and consume a
// credit. The RPC uses INSERT ... ON CONFLICT DO UPDATE RETURNING so the increment and
// the count are a single operation from the database's perspective.
const { data: rpcData, error: rpcError } = await admin.rpc('increment_diagnosis_quota', ...);
```

### What comments must not do

Do not restate what the code does:

```typescript
// Wrong: this just restates the function call.
// Get the Gemini model
const model = getDiagnosisModel();

// Wrong: the variable name already says this.
// Set count to 1
const count = 1;
```

Do not leave commented-out code in the repository. If code needs to be removed, remove it. Version control exists to recover it if needed.

### Comment style

Write comments in natural, human prose — complete sentences where the thought warrants it, short phrases where it does not. The test is: could a developer who has never seen this file read this comment aloud without it sounding robotic?

```typescript
// Good — reads naturally.
// We only run this in development because the timings are noisy in production
// and would pollute the Vercel log drain with high-frequency debug output.
if (process.env.NODE_ENV !== 'development') return;

// Bad — reads like generated documentation.
// Checks if the node environment is not development and returns early if true.
if (process.env.NODE_ENV !== 'development') return;
```

### Section dividers

Use the `// --- Section name` pattern to divide long files into named sections. This makes files scannable without a table of contents, and gives AI tools a reliable landmark to orient around:

```typescript
// --- Pricing table -----------------------------------------------------------

const PRICING: Record<string, { input: number; output: number }> = { ... };

// --- Internal helpers --------------------------------------------------------

function resolveModelPricingKey(modelName: string): string { ... }

// --- Public API --------------------------------------------------------------

export async function logGeminiUsage(...) { ... }
```

### TODO comments

Use a consistent format so TODOs are searchable and attributable:

```typescript
// TODO(matthew): Replace this with a nonce-based CSP once Next.js supports it cleanly.
// TODO(beta): Confirm GEMINI_API_KEY has a spending limit set before going live.
// TODO(post-mvp): Add per-endpoint cost breakdowns to the admin dashboard.
```

The tag in parentheses is either a person's name (ownership) or a milestone (`beta`, `launch`, `post-mvp`). TODOs without a tag are not actionable and must not be merged.

### File headers

Every file in `app/api/` must begin with a comment listing its required environment variables. Every file in `lib/` that wraps an external service must state what that service is and what configuration it needs:

```typescript
// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ADMIN_PASSWORD

// This module wraps the Upstash Redis rate limiting client. It requires
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to be set in production.
// When those variables are absent (development, CI), it falls back to a
// process-local in-memory store, which is not shared across serverless instances.
```

---

## 8. Error Handling

### Every catch block must be deliberate

A `catch` block that does nothing is almost never correct. Every caught error must be handled in one of three ways:

1. Re-thrown (if the caller is better positioned to handle it)
2. Logged and returned as a typed fallback (for pipeline steps that must not crash the whole request)
3. Suppressed with an explicit comment explaining why suppression is correct (rare — only for expected non-error conditions such as "cookie store is read-only in Server Components")

```typescript
// Correct pattern for a pipeline step that must return a fallback, not crash.
try {
    const result = await model.generateContent({ ... });
    return result;
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agent-classify] generateContent threw', { message, conversationId });
    logPipelineStep({ stepName: 'agent-classify', status: 'error', errorMessage: message, ... });
    return { ...FALLBACK_CLASSIFICATION, requestFailed: true };
}

// Correct pattern for intentional suppression — note the explanation.
} catch {
    // Deliberately ignored. The cookie store is read-only in Server Component
    // contexts, and this is an expected, harmless failure.
}

// Wrong: swallows the error with no record that it happened.
} catch {}
```

### Use `unknown` in catch clauses, not `any`

TypeScript 4+ defaults `catch` clause variables to `unknown` when `useUnknownInCatchVariables` is enabled (which it is under `strict: true`). Never override this with `any`:

```typescript
// Correct: narrow the type before using it.
} catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
}
```

### API route error responses

All error responses from route handlers must use a consistent shape that clients can rely on. The `error` field is a machine-readable snake_case code that client-side `switch` statements can match against. The `message` field is human-readable and may change without breaking clients:

```typescript
return NextResponse.json(
    {
        error: 'quota_exceeded',
        message: 'You have reached your daily diagnosis limit. Try again tomorrow.',
    },
    { status: 429 },
);
```

Never return a bare HTTP error status with no body, and never return a non-JSON body from a JSON API route.

---

## 9. React and Next.js

### Server Components are the default

In the App Router, every component is a Server Component unless it explicitly opts out with `'use client'`. Server Components run on the server, have direct access to data sources, produce no JavaScript bundle payload, and are the correct choice for any component that does not need browser APIs, event listeners, or React state.

The decision to add `'use client'` must be deliberate. Add it only when the component needs one of the following:

- `useState`, `useReducer`, or `useEffect`
- Browser APIs (`window`, `navigator`, `FileReader`, `IntersectionObserver`)
- Event handlers that need to run in the browser (form submissions, click handlers that update state)
- Third-party libraries that are not compatible with server rendering

### The page/client split

Every interactive route must use the two-file pattern:

`page.tsx` is a Server Component. It handles authentication, data fetching from Supabase, metadata for the page, and access control. It passes the fetched data to `client.tsx` as props. It contains no `useState`, no event handlers, and no browser APIs.

`client.tsx` is a Client Component. It handles all interactivity. It receives its initial data as props from `page.tsx` and manages its own state from there. It must not make its own Supabase calls where the data could reasonably be fetched server-side.

This split is not just an architectural preference — it has a measurable performance impact. Data fetched in a Server Component never makes a waterfall round-trip from the browser, and the component itself produces no client JavaScript payload.

### Declare the component boundary clearly

Every `client.tsx` file must begin with `'use client'` followed by a comment explaining why it is a client component:

```typescript
'use client';
// Needs browser APIs (heic2any for image conversion, FileReader for previews)
// and multi-step local state that does not need to survive a page reload.
```

Every `page.tsx` file must have a brief comment stating what it fetches and whether authentication is required:

```typescript
// Server Component. Fetches the contractor profile and gallery from Supabase.
// Redirects to /start if the profile does not exist.
```

### Props interfaces

Every component's props interface must be defined immediately above the component, named `[ComponentName]Props`. JSDoc comments on individual props are expected for any prop whose name or purpose is not immediately obvious:

```typescript
interface DiagnosisClientProps {
    /** Pre-fetched conversation, or null if this is a new session. */
    initialConversation: Conversation | null;
    /** The authenticated user's UUID, or null for anonymous/guest sessions. */
    userId: string | null;
}

export default function DiagnosisClient({ initialConversation, userId }: DiagnosisClientProps) {
```

### Keys on lists

Keys on list items must be stable, unique identifiers — never array indices. Array indices as keys cause React to re-render incorrectly when the list order changes or items are inserted at positions other than the end.

```typescript
// Correct: the id is stable and unique.
{contractors.map((c) => <ContractorCard key={c.id} contractor={c} />)}

// Wrong: the index changes when items are reordered or filtered.
{contractors.map((c, i) => <ContractorCard key={i} contractor={c} />)}
```

### `useCallback` and `useMemo`

Do not add `useCallback` or `useMemo` speculatively. These hooks have a real overhead (the closure allocation and dependency comparison on every render) that only pays off when the memoised value is expensive to compute or when referential stability is required to prevent a child from re-rendering. Add them when you have a measured reason to, not because it feels like it might help.

### Dynamic imports for heavy client libraries

Any library that is only needed on interaction or on a specific route must be dynamically imported. This applies particularly to libraries that are large, Node.js-incompatible, or only used in one context:

```typescript
// Heavy image conversion library — only imported when the user actually selects a file.
async function convertHeicToJpeg(blob: Blob): Promise<string> {
    const { default: heic2any } = await import('heic2any');
    // ...
}

// Component only needed when the filter sheet is opened — not part of the initial bundle.
const FilterSheet = dynamic(
    () => import('@/app/match/components/filter-sheet').then((m) => ({ default: m.FilterSheet })),
    { ssr: false },
);
```

---

## 10. API Route Handlers

### File header

Every route handler file must begin with a comment listing its required environment variables. This is a contractual statement of the file's external dependencies:

```typescript
// Required env vars: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, GEMINI_API_KEY
```

### Rate limiting is mandatory on public routes

Every route that is publicly accessible — meaning not protected by `requireAdmin` — must call `checkRateLimit` as its first operation, before any authentication or data access:

```typescript
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, 'diagnose');
    if (limited) return limited;

    // Authentication and business logic follow.
}
```

Adding a new public route means adding a corresponding bucket to `src/lib/rate-limit-config.ts`. A route without a rate limit bucket is incomplete.

### Response shape

Successful responses return the data directly with no wrapper envelope. Error responses always include an `error` field (snake_case, machine-readable) and a `message` field (human-readable). HTTP status codes must be semantically correct:

- `200` — success
- `400` — client error (malformed request, validation failure)
- `401` — not authenticated
- `403` — authenticated but not authorised
- `404` — resource not found
- `429` — rate limited or quota exceeded
- `500` — unexpected server error

### Dependency call graph comment

Any route handler with more than two or three non-trivial dependencies benefits from a brief call graph comment at the top of the `POST`/`GET` function. This is the single most useful thing you can add for an AI assistant that needs to understand the flow without reading 400 lines:

```typescript
/**
 * POST /api/diagnose
 *
 * Accepts a conversation history and optional images, runs the two-stage
 * Gemini classification + prose pipeline, and streams the result back.
 *
 * Call order:
 *   1. checkRateLimit           — rejects excess requests before any work is done
 *   2. incrementDiagnosisQuota  — atomic DB quota check (RPC)
 *   3. runClassification        — Agent 2a: trade, urgency, confidence (agent-classify.ts)
 *   4. runProseGeneration       — Agent 2b: narrative fields (agent-prose.ts)
 *   5. logGeminiUsage           — fire-and-forget cost log (ai-cost-logger.ts)
 *   6. logPipelineStep          — structured timing log (ai-logging.ts)
 */
export async function POST(req: NextRequest) {
```

---

## 11. Supabase

### Choose the right client

Using the wrong client is a security issue, not just a convenience issue. The admin client bypasses Row Level Security entirely — any query it makes operates as a superuser. It must never be used in a client component, and it must only be used in server-side code where bypassing RLS is intentionally required.

| Context                                                  | Client to use                      |
|----------------------------------------------------------|------------------------------------|
| Route handler with an authenticated user session         | `createSupabaseServerClient`       |
| Route handler or cron job needing admin / service-role   | `createSupabaseAdminClient`        |
| Server Component reading public or session-gated data    | `createServerSupabaseClient`       |
| Client Component (browser)                               | `createBrowserClient` from `supabase.ts` |

### Always handle the error field

Every Supabase query returns `{ data, error }`. The `error` field must always be checked before using `data`. Ignoring it means a failed query silently produces `null` data, which then crashes somewhere else with a confusing error:

```typescript
const { data, error } = await admin
    .from('contractors')
    .select('id, trade_name')
    .eq('id', contractorId)
    .single();

if (error) {
    console.error('[contractor-profile] Supabase query failed', {
        contractorId,
        error: error.message,
    });
    return null;
}
```

### Migrations

Every schema change must have a migration file in `supabase/migrations/`. Schema changes applied directly to the Supabase dashboard without a corresponding migration file break reproducibility and make it impossible to replay the schema on a new project or environment.

Migration files must be named with a full timestamp (`YYYYMMDDHHMMSS`) to ensure correct ordering. Every migration must include a comment block explaining what it creates or changes and why.

---

## 12. Structured Logging

All server-side log output must be structured JSON, not concatenated strings. Structured JSON can be queried in Vercel's log drain and in any logging service. Concatenated strings cannot:

```typescript
// Correct: each field is independently queryable.
console.error(JSON.stringify({
    type: 'pipeline_error',
    stepName: 'agent-classify',
    conversationId,
    userId,
    error: message,
}));

// Wrong: the fields are buried in an unqueryable string.
console.error(`[agent-classify] failed for user ${userId}: ${message}`);
```

Use `logPipelineStep` from `@/lib/ai-logging` for all diagnosis pipeline events. Use `logGeminiUsage` from `@/lib/ai-cost-logger` for all Gemini API calls. These two functions produce consistent, queryable output — do not replace them with ad-hoc `console.log` calls.

---

## 13. Testing

Test files live in a `__tests__/` folder immediately adjacent to the module being tested, not in a top-level `tests/` folder. Tests that are close to the module they cover are easier to maintain and harder to neglect.

### Test descriptions read as specifications

The description of each test must be a precise specification of the behaviour under test, written as a complete sentence. A test suite should be readable as a list of facts about the module:

```typescript
// Correct: a complete specification.
it('returns EMPTY when the Gemini call times out after 15 seconds')
it('deduplicates identical part names before calling Gemini')
it('preserves result order to match the input order of part names')

// Wrong: vague and not machine-searchable.
it('handles timeout')
it('works with duplicates')
```

### Arrange, Act, Assert

Every test must follow the Arrange / Act / Assert structure, with a blank line between each phase. The structure makes it immediately clear what is being set up, what is being invoked, and what is being verified:

```typescript
it('returns EMPTY when all sources have blank snippets and the model returns null prices', async () => {
    // Arrange
    mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify({ price_min: null, price_max: null, price_display: null }) },
    });
    const sources: MarketRateSource[] = [{ title: 'Some result', snippet: '' }];

    // Act
    const result = await extractPrice('replacement tap washer', sources);

    // Assert
    expect(result).toEqual(EMPTY);
});
```

### Mock at the right boundary

Mock at the module boundary — the point where your code calls an external dependency — not at an internal implementation detail. A test that mocks an internal function is testing the implementation, not the behaviour. When the implementation changes, the test breaks even though the behaviour may not have.

### `vi.hoisted()` for mock factory variables

When a Vitest mock factory (`vi.mock()`) needs to reference a variable, that variable must be declared with `vi.hoisted()`. Vitest hoists `vi.mock()` calls to the top of the file before any module code runs, which means variables declared in the normal module scope are not yet initialised when the factory runs:

```typescript
// Correct: vi.hoisted() ensures the variable is created before the factory runs.
const { mockGenerateContent } = vi.hoisted(() => {
    const mockGenerateContent = vi.fn();
    return { mockGenerateContent };
});

vi.mock('@/lib/ai-client', () => ({
    getGeminiModel: () => ({ generateContent: mockGenerateContent }),
    GEMINI_MODEL_NAME: 'gemini-2.5-flash',
}));
```

---

## 14. AI-Assisted Development

This section contains the conventions that have the most direct impact on the cost and quality of AI-assisted coding. These rules reduce the number of tokens an AI model must spend on orientation — understanding what a file does, what it depends on, and what calls it — leaving more token budget for the actual work.

### Write the contract before the implementation

When adding a new function, write the type signature and JSDoc block first, before the body. This gives an AI model a precise specification to implement against. It also forces you to think clearly about what the function needs and what it returns before you start writing code — which catches design mistakes early.

### Keep files under approximately 400 lines

A file that fits in a single AI context window can be reasoned about as a complete unit. A file that does not must be read in parts, which increases the risk that the model misses relevant context. When a file exceeds 400 lines, extract the next coherent group of functions into a co-located module.

The diagnosis route handler (`route.ts`) currently exceeds this limit and is a known technical debt item. Its agent-based refactoring (into `agent-classify.ts` and `agent-prose.ts`) is the correct direction.

### Type everything at module boundaries

Untyped parameters or return values at the boundary between modules force an AI tool to trace through multiple files to determine the expected shape. One precise type annotation at the boundary is worth many lines of implementation code to an AI model trying to answer "what does this accept?":

```typescript
// Every parameter and the return type are explicitly stated. An AI model reading
// only this signature knows everything it needs to call this function correctly.
export async function runClassification(
    contents: GeminiContent[],
    serviceListText: string,
    allowedTradeLabels: string[],
    ctx?: { userId?: string | null; conversationId?: string | null },
): Promise<ClassificationResult> {
```

### Name things at the level of the domain, not the implementation

AI models use names to understand intent. A function named `upsertRow` could do almost anything. A function named `incrementDiagnosisQuota` tells the model exactly what domain concept it serves, which makes every call site self-documenting:

```typescript
// From the call site alone, the intent is unambiguous.
await incrementDiagnosisQuota(userId, today);
await logGeminiUsage(result.response.usageMetadata, ctx);
await runClassification(contents, serviceListText, allowedTradeLabels, ctx);
```

### Add a dependency map to complex route handlers and orchestrators

A brief call-order comment at the top of any file with more than three significant dependencies pays for itself immediately. It means any AI tool (or new developer) can orient in that file without reading every line:

```typescript
/**
 * Call order:
 *   1. checkRateLimit           — rate guard, returns 429 if exceeded
 *   2. incrementDiagnosisQuota  — atomic DB quota check, returns 429 if exceeded
 *   3. runClassification        — Gemini Agent 2a
 *   4. runProseGeneration       — Gemini Agent 2b
 *   5. logGeminiUsage           — fire-and-forget cost logging
 */
```

### Avoid patterns that require reading multiple files to understand one function

Functions that depend on module-level mutable state, implicit ordering contracts, or shared global singletons require the reader to understand the entire file — sometimes the entire module — to reason about a single call. These patterns are expensive for AI models and humans alike.

Write functions that can be understood from their signature and their JSDoc block alone. When a function has a non-obvious dependency on shared state, document that dependency explicitly in the JSDoc.

### Prefer explicit error returns over thrown exceptions in pipeline code

In a multi-step pipeline, throwing an exception from a sub-step causes the entire pipeline to unwind unless every caller has a catch block. Returning a typed fallback result (with a `requestFailed: true` flag, for example) keeps the pipeline running and makes the failure visible at the point where it matters:

```typescript
// The caller gets a typed result it can inspect, rather than an unhandled exception.
return { ...FALLBACK_CLASSIFICATION, requestFailed: true };

// The caller can check this flag and decide whether to continue or return an error response.
const classification = await runClassification(contents, serviceListText, tradeLabels, ctx);
if (classification.requestFailed) {
    // Handle gracefully — return a partial response or an error to the client.
}
```

---

*Last updated: May 2026. Owner: Matthew Prowse.*
