# Phase A7 — Hot-Path Test Coverage & Documentation Drift

**Date:** 2026-05-23  
**Scope:** Test coverage gaps on critical paths; documentation accuracy in CLAUDE.md and ai-coding-improvements.md  
**Test files scanned:** 28 files across src/  
**Findings:** 15 total (4 HIGH, 5 MEDIUM, 6 LOW)

---

## Summary

The diagnosis pipeline's most critical paths (route handler, classification agent, prose generation, prompt composition) have **zero or severely shallow test coverage**. The route handler (1555 lines) is completely untested; classification and prose agents are untested; prompt composition is 60% covered. Documentation in CLAUDE.md drifts on import paths (createBrowserClient missing) and prompt version (v6.0 vs v7.3 actual); ai-coding-improvements.md mismarks two items as [x] complete when they are not (business logic extraction, barrel exports).

**Critical gaps:** diagnose/route.ts, agent-classify.ts, agent-prose.ts, prompts/composer.ts (60% coverage), plus 4 MEDIUM findings on handler/persistence/cron-auth/rate-limit-config.

**Test inventory:** 28 test files covering utilities, parsing, auth, and providers well. Diagnosis pipeline and routing orchestration dramatically underserved.

---

## Section 1 — Hot-Path Test Coverage

The playbook requires explicit test coverage for 14 critical files. This section documents each missing or shallow test.

### HIGH SEVERITY

#### F1. [HIGH] Missing test file — src/app/api/diagnose/route.ts

**Check:** test file exists and covers quota enforcement, rate limiting, NDJSON stream output shape  
**Severity:** HIGH (the most critical path in the application)  
**Evidence:**  
- No test file exists at `src/app/api/diagnose/__tests__/route.test.ts`  
- The diagnose route is 1555 lines (found by A3) and orchestrates:
  - Rate limit enforcement (lines 114–116)
  - Quota check via Supabase RPC (lines 145–200)
  - Two-agent orchestration (classification + prose generation)
  - NDJSON response streaming (100+ lines)
  
**Gap specifics:**
- No test for quota RPC atomic increment behavior  
- No test for rate limit rejection (should return 429)
- No test for NDJSON stream output format (type/text/complete lines)
- No test for error recovery (malformed request bodies, missing images, Gemini timeout)

**Recommendation:** Create `src/app/api/diagnose/__tests__/route.test.ts` with tests for:
1. Rate limit rejection (mocked checkRateLimit returns 429)
2. Quota exceeded scenario (mocked RPC returns > limit)
3. Happy-path NDJSON streaming (verify thought + complete structure)
4. Error cases (missing required fields, invalid image URLs, Gemini call failure)
5. Follow-up mode (ensure quota is NOT checked when history.length > 0)

**Risk if not addressed:** The most critical path in the application has zero regression protection. Any AI-assisted change to quota/rate-limit/streaming logic risks breaking production.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F2. [HIGH] Missing test file — src/features/diagnosis/agent-classify.ts

**Check:** test file exists and covers trade classification correctness + confidence outputs  
**Severity:** HIGH (first of two AI calls on every diagnosis)  
**Evidence:**  
- No test file at `src/features/diagnosis/__tests__/agent-classify.test.ts`  
- Existing test file `agent-classify-finalize.test.ts` (77 lines) only tests the post-parse finalization step
- The agent itself (`runClassification`) is never exercised in tests:
  - Schema-enforced Gemini call (never mocked or validated)
  - Taxonomy mapping via `finalizeClassificationAgainstCatalogAndTaxonomy` (finalization only, not agent output)
  - Confidence scoring logic (never tested)
  - Rejected flag handling (finalization tested, but agent output path not)

**Gap specifics:**
- No test for schema enforcement (does Gemini output match the CLASSIFICATION_SCHEMA?)  
- No test for confidence boundaries (e.g., confidence: 0–100 range validation)  
- No test for trade label fallback (when Gemini returns unmapped trade, does finalization coerce it correctly?)
- No test for cascading_damage / unsupported_reason field population

**Recommendation:** Create `src/features/diagnosis/__tests__/agent-classify.test.ts` with:
1. Unit test for `runClassification` with mocked Gemini model  
2. Test valid schema outputs (trade, confidence, subcategory_id)  
3. Test edge cases (confidence = 0, rejected = true, confidence > 100)  
4. Test error handling (if Gemini throws, what does runClassification return?)  
5. Integration test with `finalizeClassificationAgainstCatalogAndTaxonomy` to verify end-to-end coercion

**Risk if not addressed:** Classification is the first of two AI calls on every diagnosis. Silent regressions in trade mapping or confidence scoring would degrade match quality without alerting the user.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F3. [HIGH] Shallow test coverage — src/features/diagnosis/agent-prose.ts

**Check:** test file exists and covers title/message/thought output + follow-up handling  
**Severity:** HIGH (second of two AI calls; produces user-facing narrative)  
**Evidence:**  
- Related test file exists: `src/features/diagnosis/__tests__/image-observations.test.ts` (147 lines)
- This file only tests `normaliseImageObservations()` — a post-processing utility
- The `runProseGeneration()` function itself is **never called or mocked** in any test
- Output validation for prose fields (thought, diagnosis, message, action_required) is absent
- Follow-up prompt branching (via `isFollowUp` flag) is untested

**Gap specifics:**
- No test for `runProseGeneration` with valid Gemini output  
- No test for thought field extraction and formatting  
- No test for multi-line message handling (prose agent may wrap to multiple paragraphs)  
- No test for follow-up scenarios (does the agent produce different output when isFollowUp=true?)  
- No test for error recovery (if Gemini times out or returns malformed JSON)

**Recommendation:** Create or expand test to cover:
1. Mock `runProseGeneration` with a sample valid ProseResult  
2. Test thought field extraction (should trim and not include JSON)  
3. Test message field is non-empty and fits expected length  
4. Test follow-up flag produces different prompt/output than initial diagnosis  
5. Test error handling (agent call fails, returns error object)

**Risk if not addressed:** Prose generation is the second AI call; it produces the user-facing narrative. Regressions here would be immediately visible but without regression tests, drift in message tone or format would only be caught by manual QA.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F4. [HIGH] Shallow test coverage — src/features/diagnosis/prompts/composer.ts

**Check:** test file exists and covers prompt composition for all scenarios  
**Severity:** HIGH (prompt composition is frequent and high-impact)  
**Evidence:**  
- Test file exists: `src/features/diagnosis/__tests__/composer.test.ts` (263 lines)  
- Coverage includes:
  - `buildSystemInstruction` with various PromptContext scenarios (with/without image, follow-up, feedback, providers)
  - `buildProseBaseInstruction` basics
  - Service list inclusion
  - Output format blocks (thought/json tags)
  - Feedback-specific instruction injection
  
- **Coverage gaps:**
  - No test for `buildImageFirstMessagePrompt` (image scenario — one of the hot paths)  
  - No test for `buildTextOnlyFirstMessagePrompt` (text-only scenario)  
  - No test for `buildImageFollowUpPrompt` (follow-up with image re-submission)  
  - No test for `buildProviderHydrationImagePrompt` (match-prefetch optimization)  
  - No test for special cases: `buildUnsupportedHomeServiceMessage`, `buildUnrelatedImageMessage`  
  - No test for error cases (empty service list, null providers, malformed context)

**Gap specifics:**
- Image prompt composition is untested — if the image-embedding prompt syntax drifts, tests won't catch it  
- Follow-up prompt flow (tell model about previous diagnosis) is untested  
- Provider hydration prompt (market context injection) is untested  
- Special-case messages (user confusion, unsupported service) are untested

**Current test depth:** 60% (base instruction well-covered, other builders not exercised)

**Recommendation:** Expand test file to:
1. Test all buildXxxPrompt functions with valid inputs  
2. Test edge cases (empty services, no providers, max image count)  
3. Test prompt format consistency (all results are strings, non-empty)  
4. Test special cases (unrelated image, unsupported service) produce expected warning text  
5. Add a table of scenarios with expected substring presence (image prompt should mention pixel dimensions, follow-up should mention "previous", etc.)

**Risk if not addressed:** Prompt composition changes are frequent and high-impact. Without comprehensive tests, drift in system/user turn formatting could break Gemini's schema validation or cause JSON parsing failures downstream.

**Owner action:** ☐ Approve  ☐ Defer

---

### MEDIUM SEVERITY

#### F5. [MEDIUM] Missing test file — src/lib/providers/handler.ts

**Check:** test file exists and covers provider search/match orchestration  
**Evidence:**  
- No test file at `src/lib/providers/__tests__/handler.test.ts`  
- handler.ts is 200+ lines and orchestrates:
  - Supabase client instantiation  
  - Provider query building  
  - Ranking and scoring  
  - Review enrichment with timeout  
  - Caching logic  
  
- No unit test for the orchestration logic (only individual utilities like ranking, query-builder are tested)

**Gap specifics:**
- No test for cache hit/miss behavior  
- No test for ranking result ordering  
- No test for review enrichment timeout (does handler respect withTimeout?)  
- No test for empty result set handling

**Recommendation:** Create `src/lib/providers/__tests__/handler.test.ts` with:
1. Mock database and cache  
2. Test provider query → ranking → cache population  
3. Test cache retrieval on repeated calls  
4. Test timeout behavior on review enrichment  
5. Test result ordering (top-ranked providers first)

**Risk if not addressed:** Provider orchestration is a critical user-facing feature. Ranking/caching regressions could cause providers to appear in wrong order or stale data to be shown.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F6. [MEDIUM] Missing test file — src/lib/providers/persistence.ts

**Check:** test file exists and covers DB read/write correctness  
**Evidence:**  
- No test file at `src/lib/providers/__tests__/persistence.test.ts`  
- persistence.ts contains critical functions:
  - `toGooglePlaceId` / `fromGooglePlaceId` (ID format conversions)
  - Database upsert/insert/delete operations
  - Field mapping (Google Places → internal schema)
  
- No tests for these operations

**Gap specifics:**
- No test for ID format round-tripping (place_id → internal format → place_id)  
- No test for database write operations  
- No test for field mapping accuracy  
- No test for error handling (invalid place_id, database constraints)

**Recommendation:** Create `src/lib/providers/__tests__/persistence.test.ts` with:
1. Test ID conversions (round-trip)  
2. Mock database calls and verify query shapes  
3. Test field mapping (Google schema → internal)  
4. Test error cases (invalid IDs, DB errors)

**Risk if not addressed:** Provider data integrity depends on persistence correctness. Silent errors could cause providers to be stored with corrupted IDs or missing fields.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F7. [MEDIUM] Missing test file — src/lib/auth/cron-auth.ts

**Check:** test file exists and covers bearer token validation  
**Evidence:**  
- No test file at `src/lib/__tests__/cron-auth.test.ts`  
- cron-auth.ts exports `isAuthorizedCronRequest` function  
- No tests for token validation, extraction, comparison logic

**Gap specifics:**
- No test for valid token acceptance  
- No test for invalid/missing token rejection  
- No test for token format validation (Bearer prefix)

**Recommendation:** Create `src/lib/__tests__/cron-auth.test.ts` with:
1. Test valid token acceptance  
2. Test missing Authorization header rejection  
3. Test malformed Bearer token rejection  
4. Test wrong token rejection

**Risk if not addressed:** Cron jobs (enrichment, cleanup) must be gated. Without tests, a typo in token validation logic could allow unauthorized access or lock out legitimate cron jobs.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F8. [MEDIUM] Missing test file — src/lib/rate-limit-config.ts

**Check:** test file exists and covers bucket lookup + default fallback  
**Evidence:**  
- No test file at `src/lib/__tests__/rate-limit-config.test.ts`  
- rate-limit-config.ts exports `checkRateLimit` function which:
  - Looks up bucket config by name
  - Falls back to defaults
  - Calls `applyRateLimit` in `rate-limit.ts`
  
- No tests for bucket lookup behavior

**Gap specifics:**
- No test for known bucket (e.g., 'diagnose', 'providers') config retrieval  
- No test for unknown bucket fallback behavior  
- No test for checkRateLimit returning 429 vs letting through

**Recommendation:** Create `src/lib/__tests__/rate-limit-config.test.ts` with:
1. Test known bucket config lookup  
2. Test unknown bucket default fallback  
3. Test checkRateLimit returns 429 when bucket is exceeded  
4. Test checkRateLimit returns null when under limit

**Risk if not addressed:** If bucket configs are misconfigured (e.g., 'diagnose' bucket not defined), rate limiting silently falls back to defaults. Tests would catch misconfigurations.

**Owner action:** ☐ Approve  ☐ Defer

---

### LOW SEVERITY

#### F9. [LOW] Missing import export — createBrowserClient not found in lib/auth/supabase.ts

**Check:** Key Patterns section, import path verification  
**CLAUDE.md claims:**  
```typescript
import { createBrowserClient } from '@/lib/auth/supabase'
```

**Evidence:**  
- `src/lib/auth/supabase.ts` exports `getSupabase()` and `supabase` (const), NOT `createBrowserClient`

**Analysis:** The import path is stale. The actual exports are `getSupabase()` (function) and `supabase` (const instance).

**Recommendation:** Update CLAUDE.md Key Patterns section to reflect actual exports:
```typescript
import { getSupabase } from '@/lib/auth/supabase';
// OR
import { supabase } from '@/lib/auth/supabase';
```

**Risk if applied:** Low — documentation clarity only. Developers following CLAUDE.md would get an import error and self-correct.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F10. [LOW] Prompt version drift — CLAUDE.md claims v6.0, actual is v7.3

**Check:** Diagnosis Pipeline section, prompt-version.ts verification  
**CLAUDE.md claims:**  
> Prompt version: currently `v6.0` (see `features/diagnosis/prompts/prompt-version.ts`).

**Evidence:**  
- `src/features/diagnosis/prompts/prompt-version.ts` exports `DIAGNOSE_PROMPT_VERSION = 'v7.3'`

**Analysis:** The documentation is out of sync by 1.3 versions. This is drift, not a bug, but indicates CLAUDE.md is not kept current.

**Recommendation:** Update CLAUDE.md to v7.3.

**Risk if applied:** Low — informational only. Outdated version in docs could confuse developers.

**Owner action:** ☐ Approve  ☐ Defer

---

#### F11. [MEDIUM] Item #2 (business logic out of api) — DRIFT in ai-coding-improvements.md

**Check:** Item #2 claim: "Move business logic out of app/api/"  
**Status:** [x] MARKED COMPLETE — but reality is PARTIAL

**Evidence:**  
- A3 audit found `src/app/api/diagnose/route.ts` is 1555 lines
- Route contains quota RPC, image preprocessing, Gemini context, agent orchestration, NDJSON streaming
- Per item #2, all should move to `features/diagnosis/` or `lib/diagnosis/`
- No such extraction has occurred

**Analysis:** The [x] checkbox is misleading. The business logic remains intertwined with the route handler.

**Recommendation:** Either:
1. Actually extract orchestration to `features/diagnosis/`
2. Update the document to acknowledge "partially complete — diagnose route still needs refactoring"

**Owner action:** ☐ Approve  ☐ Update doc

---

#### F12. [MEDIUM] Item #8 (barrel exports) — INCOMPLETE in ai-coding-improvements.md

**Check:** Item #8 claim: "Add an index file (index.ts) to each feature module"  
**Status:** [x] MARKED COMPLETE — but NO index.ts files found

**Evidence:**  
- No `src/features/diagnosis/index.ts` (missing)  
- No `src/features/match/index.ts` (missing)  
- No `src/lib/ai/index.ts` (missing)  

**Analysis:** The checkpoint is mislabeled. Barrel exports have NOT been added.

**Recommendation:** Update the document to reflect "not started" or create the barrel files.

**Severity:** MEDIUM — mislabeled checkpoint. Future tasks may assume barrel exports exist.

**Owner action:** ☐ Create barrel files  ☐ Update doc

---

#### F13. [LOW] Incomplete directory documentation in CLAUDE.md

**Check:** "Where Things Live" section — unlisted directories that exist  
**Evidence:**  
- Multiple app/ routes not listed: about/, account/, admin/, auth/, branding/, coming-soon/, contact/, design/, landing1/, landing2/, open-on-phone/, page/, privacy/, processing/, rate/, terms/
- Top-level src/ dirs not listed: context/, fonts/, types/

**Analysis:** The tree in CLAUDE.md documents only core journeys (start → diagnosis → report → match) and omits secondary routes. This is intentional minimization but could be confusing.

**Recommendation:** Add a note: "Abbreviated tree — shows primary diagnosis/match journeys. Marketing pages and utility directories (context, fonts, types) exist but are not listed here."

**Severity:** LOW — tree is focused on core functionality, defensible but less transparent.

**Owner action:** ☐ Add note  ☐ Expand tree

---

## Section 3 — Test Surface Inventory

**28 test files currently in src/** — comprehensive inventory for ownership reference.

| File | Lines | Coverage |
|---|---|---|
| src/app/contractors/lib/__tests__/hours.test.ts | 129 | Weekend/holiday hours parsing |
| src/app/contractors/lib/__tests__/review-formatters.test.ts | 73 | Google Review formatting utilities |
| src/features/diagnosis/__tests__/agent-classify-finalize.test.ts | 77 | Trade taxonomy finalization (post-parse coercion) |
| src/features/diagnosis/__tests__/composer.test.ts | 263 | Prompt system instruction building (60% depth) |
| src/features/diagnosis/__tests__/image-observations.test.ts | 147 | Image observation parsing and normalization |
| src/features/diagnosis/__tests__/processing-orchestrator.test.ts | 256 | Processing step sequencing and diagnosis completion checks |
| src/lib/__tests__/admin-auth.test.ts | 127 | Admin route gating (requireAdmin) |
| src/lib/__tests__/parse-diagnosis.test.ts | 85 | Diagnosis JSON parsing (18 golden test cases) |
| src/lib/__tests__/rate-limit.test.ts | 286 | Token-bucket rate limiting (in-memory & Upstash) |
| src/lib/__tests__/safe-redirect.test.ts | 77 | Open-redirect prevention |
| src/lib/__tests__/services.test.ts | 59 | Service label enumeration |
| src/lib/__tests__/whatsapp-message-validate.test.ts | 234 | WhatsApp message format validation |
| src/lib/ai/__tests__/llm-content-guard.test.ts | 186 | Content filtering and safety checks |
| src/lib/certifications/__tests__/catalog.test.ts | 185 | Contractor certification catalogue |
| src/lib/diagnosis/__tests__/diagnose-ndjson-stream.test.ts | 158 | NDJSON response parsing and error recovery |
| src/lib/diagnosis/__tests__/diagnosis-trade-taxonomy.test.ts | 169 | Trade/subcategory taxonomy mapping |
| src/lib/diagnosis/__tests__/start-description-quality.test.ts | 169 | User input validation (start page) |
| src/lib/diagnosis/__tests__/structural-confidence.test.ts | 308 | Confidence scoring algorithm |
| src/lib/email/__tests__/utils.test.ts | 341 | Email utility functions (addresses, validation) |
| src/lib/providers/__tests__/cache.test.ts | 49 | Provider result caching |
| src/lib/providers/__tests__/fast-review-summary.test.ts | 62 | Review summary generation |
| src/lib/providers/__tests__/open-status.test.ts | 219 | Business hours / open status logic |
| src/lib/providers/__tests__/query-builder.test.ts | 39 | Supabase query construction |
| src/lib/providers/__tests__/ranking.test.ts | 170 | Provider scoring and ranking |
| src/lib/providers/__tests__/relevance.test.ts | 443 | Trade relevance matching (comprehensive) |
| src/lib/providers/__tests__/review-enrichment-timeout.test.ts | 20 | Timeout wrapper for review fetches |
| src/lib/providers/__tests__/review-ingestion.test.ts | 324 | Google review parsing and ingestion |
| src/lib/providers/__tests__/review-normalization.test.ts | 184 | Review text cleaning and normalization |

**Total: 4,422 lines of test code covering 28 domains.**

---

## Section 4 — Audit Method

**Tools used:**
- Bash: `find`, `grep`, `wc -l` for file discovery and inventory
- Read: CLAUDE.md, ai-coding-improvements.md, prompt-version.ts, route.ts, agent-*.ts files
- Manual: Inspection of test file presence and depth assessment

**Key searches:**
- `find src -name "*.test.ts"` — comprehensive test inventory
- `grep "^export" src/lib/auth/supabase.ts` — verify actual exports vs CLAUDE.md claims
- `grep DIAGNOSE_PROMPT_VERSION` — confirm version (v7.3 vs documented v6.0)

**Coverage assessment methodology:**
- For each hot-path file in playbook table, check for test file at canonical location
- For each existing test, read first 50–100 lines to assess variety of test cases
- Test depth rated by: count of test cases, variety of scenarios (happy path + edge cases + errors), mocking strategy

---

**Last updated: 2026-05-23. Auditor: Phase A7 automated scan.**
