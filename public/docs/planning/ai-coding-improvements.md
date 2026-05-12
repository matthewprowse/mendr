# AI-Assisted Coding Improvements

This document describes the structural and organisational changes that will make AI-assisted development (Cursor, Claude, Copilot) faster, cheaper, and more reliable. Every item is grounded in a specific observed problem in the current codebase. The changes are ordered by impact — the top items pay off on every future task; the bottom items matter as the codebase scales.

The core principle throughout is: **AI tools navigate by convention, not by memory.** When the codebase has consistent, predictable structure, AI can locate and modify the right files on the first attempt. When it doesn't, every task begins with expensive grep searches and produces changes in the wrong files.

---

## - [ ] 1. Reorganise `lib/` from 74 flat files into domain subdirectories

**Impact: Very High — affects every future task**  
**Effort: Medium (mechanical moves + import updates)**

The `lib/` directory currently contains 74 files in a single flat list with no organisational principle. When an AI (or developer) is asked to "modify the Gemini integration" or "improve provider ranking", it has to search the entire directory rather than knowing where to look. Every AI-assisted task touching `lib/` begins with a discovery phase that consumes tokens and time.

**Target structure:**

```
src/lib/
  ai/
    ai-client.ts           ← Gemini model instantiation
    ai-config.ts           ← model names, temperatures, token limits
    ai-diagnosis-backend.ts
    ai-logging.ts
    llm-content-guard.ts
    prompt-utils.ts
  providers/
    provider-enrichment.ts
    provider-gallery.ts
    provider-hours.ts
    provider-profile-clean.ts
    provider-summaries.ts
    provider-enrichment.ts
    fast-review-summary.ts
    review-formatters.ts
    review-normalization.ts
    review-summary.ts
    rating.ts
    open-status.ts
  diagnosis/
    diagnose-ndjson-stream.ts
    diagnose-prompt-providers.ts
    diagnosis-confidence.ts
    diagnosis-display.ts
    diagnosis-persist-shape.ts
    diagnosis-trade-taxonomy.ts
    parse-diagnosis-from-model-response.ts
    pending-diagnosis-images-cache.ts
  auth/
    admin-auth.ts
    cron-auth.ts
    supabase-server.ts
    supabase.ts
    supabase-verify-url.ts
  market-rates/             ← already a subdirectory, keep it
  parts-prices/             ← already a subdirectory, keep it
  certifications/           ← already a subdirectory, keep it
  (flat, ~10 files)
    analytics.ts
    audit-log.ts
    design-tokens.ts
    rate-limit.ts
    rate-limit-config.ts
    safe-redirect.ts
    site-metadata.ts
    site-url.ts
    utils.ts
    ...
```

**How to execute:** Use a script to move files and then run `sed` to update all import paths. The `@/lib/` alias means every import path is absolute and greppable. This is a mechanical task that takes ~2 hours but pays back on every subsequent AI session.

---

## - [ ] 2. Move business logic out of `app/api/` directories

**Impact: Very High — affects every provider and diagnosis task**  
**Effort: Medium**

`app/api/providers/` contains 13 non-route business logic files sitting alongside the actual route handlers:

```
app/api/providers/
  route.ts              ← entry point
  handler.ts            ← orchestration logic
  persistence.ts        ← database reads/writes
  ranking.ts            ← scoring algorithm
  relevance.ts          ← trade relevance matching
  query-builder.ts      ← Supabase query construction
  cache.ts              ← provider result cache
  contracts.ts          ← shared types
  constants.ts          ← configuration values
  google-place-reviews.ts
  review-enrichment.ts
  place-id.ts
  place-services.ts
  provider-display-name.ts
```

An AI asked to "improve provider ranking" has no reason to look inside `app/api/`. The API folder should contain only route handlers — thin entry points that call into `lib/` or `features/`. All business logic should be moved to `lib/providers/` or `features/providers/`.

**Target structure after move:**

```
app/api/providers/
  route.ts              ← imports from @/lib/providers/handler
  [id]/route.ts

lib/providers/ (or features/providers/)
  handler.ts
  persistence.ts
  ranking.ts
  relevance.ts
  query-builder.ts
  cache.ts
  contracts.ts
  constants.ts
  google-place-reviews.ts
  review-enrichment.ts
  place-id.ts
  place-services.ts
  provider-display-name.ts
```

The same principle applies to `app/api/diagnose/`, which currently holds the agent files (`agent-classify.ts`, `agent-prose.ts`, `image-tier.ts`, `diagnosis-json-validate.ts`) and the entire prompt system. These belong in `features/diagnosis/` or `lib/ai/`.

---

## - [ ] 3. Move the prompt system to `features/diagnosis/prompts/`

**Impact: Very High — the most AI-critical logic in the codebase**  
**Effort: Low (move + update imports)**

The prompt system — 9 files in `app/api/diagnose/prompts/` — is the most important and most frequently modified code in the entire application. It controls what the AI diagnoses, how it formats output, how it handles edge cases, and how it incorporates provider context.

Burying this inside an API route directory means:
- AI tools looking for "the prompts" will not find them without grepping
- There is no natural place to add prompt tests
- Prompt logic is conflated with HTTP routing logic

**Target location:** `src/features/diagnosis/prompts/`

This makes the diagnosis feature self-contained: types, orchestration, prompts, and tests all live under `src/features/diagnosis/`.

---

## - [ ] 4. Consolidate the dual diagnosis parser

**Impact: High — affects every future diagnosis parsing change**  
**Effort: Low**

There are currently two functions that parse model wire output into usable data:

1. `tryParseDiagnosisJson` in `src/lib/utils.ts` — a partial parser used directly by `chat-page-client.tsx` at 4 call sites
2. `parseDiagnosisFromModelResponse` in `src/lib/parse-diagnosis-from-model-response.ts` — the canonical, well-tested parser

Any AI asked to "fix a parsing edge case" will find both functions. If it patches `tryParseDiagnosisJson`, the chat page gets the fix but the diagnosis flow does not. If it patches `parseDiagnosisFromModelResponse`, the diagnosis flow gets the fix but the chat page does not.

**Fix:** Replace the 4 `tryParseDiagnosisJson` call sites in `chat-page-client.tsx` with `parseDiagnosisFromModelResponse`. Then either delete `tryParseDiagnosisJson` from `utils.ts` or clearly document it as an internal utility that is not the canonical parser. The 18 golden tests in `parse-diagnosis.test.ts` are the regression baseline for this change.

---

## - [x] 5. Delete all dead parallel directories

**Impact: High — reduces AI confusion and search surface**  
**Effort: Low (deletion only)**

The codebase contains several directories that are parallel copies of active directories, with zero imports. Every AI search that scans the file tree encounters these as candidates, producing uncertainty about which version is the active one.

**Delete these:**

| Directory | Reason |
|---|---|
| `src/app/contractors/_components/` | Zero imports. Parallel to `contractors/components/` |
| `src/app/contractors/_lib/` | Zero imports. Parallel to `contractors/lib/` |
| `src/app/contractors/_types/` | Zero imports. Parallel to `contractors/types/` |
| `src/app/contractors/_constants/` | Zero imports. Parallel to `contractors/constants/` |
| `src/app/page/_components/` | Zero imports. Parallel to `page/components/` |
| `src/app/landing/` | Orphaned experiment. Not referenced anywhere |
| `src/features/match/hooks/useMatchConversationContext.ts` | Dead duplicate of `use-match-conversation-context.ts` |
| `src/features/match/hooks/useMatchMap.ts` | Dead duplicate of `use-match-map.ts` |
| `src/features/match/hooks/useMatchProviders.ts` | Dead duplicate of `use-match-providers.ts` |

After deletion, an AI searching for "the match hooks" or "the contractors components" finds exactly one result.

---

## - [ ] 6. Enforce consistent file naming conventions across the entire codebase

**Impact: Medium — reduces disambiguation overhead on every task**  
**Effort: Low (renames)**

The current codebase has four different patterns for the same concept in different routes:

**Client component files:**
- `client.tsx` (most routes use this)
- `chat-page-client.tsx` (chat route)
- `contractor-client.tsx` (contractor detail)
- `landing-page-client.tsx` (landing)

**Rule to enforce:** All client component files should be named `client.tsx`. The route directory name provides the context. `app/chat/components/chat-page-client.tsx` → `app/chat/components/client.tsx`.

**Hook files:**
- `hooks/gallery.ts` and `hooks/use-gallery.ts` coexist in `contractors/hooks/`
- `hooks/header.ts` and `hooks/use-header.ts` coexist in `contractors/hooks/`

**Rule to enforce:** All hook files must start with `use-`. Files without the prefix are either utilities (move to `lib/`) or dead (delete).

**Constants and types files:**
- `constants/constants.ts` — the file name should not repeat the directory name
- `types/types.ts` — same issue

**Rule to enforce:** Files should be named after their domain, not after their category. `constants/constants.ts` → `constants/index.ts` or `constants/page.ts` if it's page-specific.

---

## - [ ] 7. Create a `CLAUDE.md` project brief at the repository root

**Impact: High — front-loads context on every AI session**  
**Effort: Low (one-time writing)**

Every new AI coding session begins cold. Without a project brief, the first several exchanges are spent re-establishing context that is already known: what the app does, what the tech stack is, which directories contain what, what naming conventions are used, what patterns are preferred.

A `CLAUDE.md` file at the repository root is read automatically by Claude Code and Cursor at the start of every session. A well-written one eliminates this ramp-up entirely and keeps the AI from making structural choices that conflict with established patterns.

**Recommended sections:**

```markdown
# Scandio — Project Brief

## What this is
AI-powered home fault diagnosis for Western Cape homeowners. 
Users photograph a fault, the app produces a written diagnosis, then 
connects them to vetted local contractors.

## Architecture in one paragraph
Next.js 15 App Router. Supabase for database and auth. Gemini (Google AI) 
for diagnosis and price extraction. Brave Search for market rate research.
Vercel for deployment. The primary user flow is:
/start → /diagnosis → /processing/[id] → /report/[id] → /match

## Where things live
- src/features/diagnosis/   Diagnosis domain: types, orchestrator, prompts, tests
- src/features/match/       Match domain: provider hooks, filters, cache
- src/lib/ai/               Gemini client, config, logging
- src/lib/providers/        Provider business logic (ranking, persistence, enrichment)
- src/lib/auth/             Session management, admin auth, Supabase clients
- src/app/api/              Thin route handlers only — no business logic here
- src/components/ui/        shadcn/ui primitives (do not modify directly)

## Naming conventions
- All client component files: client.tsx (not [name]-client.tsx)
- All React hooks: use-[name].ts (kebab-case, always prefixed with use-)
- API route files: route.ts only
- Test files: __tests__/[subject].test.ts

## Key patterns
- DiagnosisData type: src/features/diagnosis/types.ts (canonical)
- Auth: requireAdmin() from @/lib/auth/admin-auth for all admin routes
- Rate limiting: checkRateLimit(req, bucketName) from @/lib/rate-limit
- Diagnosis parsing: parseDiagnosisFromModelResponse() — single canonical parser

## What to avoid
- Do not add business logic to app/api/ directories
- Do not add top-level files to lib/ without a subdirectory — put them in the relevant domain folder
- Do not import DiagnosisData from @/app/chat/components/types — use @/features/diagnosis/types
- Do not add framer-motion imports to hot-path routes (processing, diagnosis, report)
```

---

## - [ ] 8. Add an index file (`index.ts`) to each feature module

**Impact: Medium — simplifies imports across the codebase**  
**Effort: Low**

Currently, code importing from the diagnosis feature must know the exact file: `import { parseDiagnosisFromModelResponse } from '@/lib/parse-diagnosis-from-model-response'`. After the lib reorganisation, this becomes `import { parseDiagnosisFromModelResponse } from '@/lib/diagnosis/parse-diagnosis-from-model-response'` — which is better but still file-path-specific.

An `index.ts` barrel export at each domain root allows: `import { parseDiagnosisFromModelResponse, DiagnosisData } from '@/features/diagnosis'`. This is a strong signal to AI tools about what a module's public surface is, and it prevents internal implementation files from being imported directly by code outside the feature.

Barrel exports are low-risk for this codebase since Next.js handles tree-shaking at the bundler level.

---

## - [ ] 9. Expand test coverage to the diagnosis pipeline hot path

**Impact: High — prevents regressions on the most critical code path**  
**Effort: Medium**

The test suite currently covers parsing, auth, rate-guard utilities, and the market research pipeline. The diagnosis API route itself — the most critical path in the application — has no test coverage. This means every AI-assisted change to the diagnosis pipeline is made without a safety net.

**Priority test targets:**

| File | What to test |
|---|---|
| `app/api/diagnose/route.ts` | Quota enforcement, rate limiting, NDJSON stream output shape |
| `features/diagnosis/processing-orchestrator.ts` | Step sequencing, partial failure handling |
| `app/api/diagnose/prompts/composer.ts` | Prompt composition for each scenario (with/without image, follow-up, special cases) |
| `lib/diagnosis/diagnose-ndjson-stream.ts` | Stream parsing, error recovery |

Prompt composition tests are particularly valuable for AI-assisted development: they make it safe for an AI to modify the prompt system because any regression in output format is caught immediately.

---

## - [ ] 10. Add a `prompt-changelog.md` to the prompt system

**Impact: Medium — institutional memory for the most sensitive code**  
**Effort: Very Low (documentation only)**

The prompt system encodes accumulated learning about what makes a good diagnosis: special case handling, output format constraints, confidence scoring, follow-up behaviour, provider hydration. None of this history is currently recorded anywhere. When an AI (or developer) modifies a prompt, there is no record of what was tried before, what broke, and why specific choices were made.

A `prompt-changelog.md` in `src/features/diagnosis/prompts/` (after the move) should record:
- The date each significant prompt change was made
- What problem it solved
- Any regressions it introduced (and how they were fixed)
- The prompt version number (already tracked in `prompt-version.ts`)

This is especially valuable for AI-assisted prompt engineering, where the model has no memory of prior sessions and will re-suggest approaches that have already been tried and rejected.

---

## - [ ] 11. Standardise how types are exported across the codebase

**Impact: Medium — reduces type import confusion**  
**Effort: Low**

The current codebase has types defined in several inconsistent locations:
- Domain types in component files (`DiagnosisData` was in `app/chat/components/types.ts` until Wave 5a)
- API contracts in route directories (`app/api/providers/contracts.ts`)
- Feature contracts in feature directories (`features/match/contracts.ts`)
- Some types inline in the files that use them

**Rule to adopt:** Types that cross module boundaries (used by more than one feature) live in `features/[domain]/types.ts`. Types used only within a module stay inline or in a local `types.ts`. Types shared across all features live in `src/types/`. API request/response contracts live with their route but are also re-exported from the feature they describe.

---

## - [ ] 12. Remove the `constants/constants.ts` and `types/types.ts` anti-pattern

**Impact: Low — cosmetic but causes AI disambiguation failures**  
**Effort: Very Low**

Several directories repeat their own name in their index file:
- `contractors/constants/constants.ts`
- `contractors/types/types.ts`

When an AI searches for "contractor types", it finds `types/types.ts` which is redundant. Rename these to `index.ts` (if they are the only file in the directory) or to a descriptive name that reflects the content (`page.ts`, `provider.ts`, etc.).

---

## Summary table

| Item | Impact | Effort | Priority |
|---|---|---|---|
| Reorganise lib/ into domain subdirs | Very High | Medium | Do first |
| Move business logic out of app/api/ | Very High | Medium | Do first |
| Move prompts to features/diagnosis/ | Very High | Low | Do first |
| Consolidate dual diagnosis parser | High | Low | Do early |
| Delete dead parallel directories | High | Low | Do early |
| Enforce naming conventions | Medium | Low | Do early |
| Create CLAUDE.md project brief | High | Low | Do immediately |
| Add index.ts barrel exports | Medium | Low | After lib reorg |
| Expand test coverage | High | Medium | Ongoing |
| Add prompt-changelog.md | Medium | Very Low | Do immediately |
| Standardise type export locations | Medium | Low | After lib reorg |
| Fix constants/types file naming | Low | Very Low | When touching those files |

---

*Last updated: May 2026. Owner: Matthew Prowse.*
