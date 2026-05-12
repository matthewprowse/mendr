# Wave 5a — Diagnosis Parser And Contract Consolidation

## Progress
**Status:** ⏸ Deferred (after Waves 1-4 complete)  
**Tasks:** 0 / 7 complete

---

## Goal
Create one canonical diagnosis wire parser and align shared types with what `/api/diagnose` actually emits.

## Scope
- `app/src/lib/parse-diagnosis-from-model-response.ts`
- `app/src/lib/utils.ts`
- `app/src/lib/diagnosis-wire/**` (new module)
- `app/src/app/chat/components/types.ts`
- `app/src/features/diagnosis/types.ts` (new or extend)
- `app/src/app/diagnosis/client.tsx`
- `app/src/app/chat/components/chat-page-client.tsx`
- `app/src/features/diagnosis/processing-orchestrator.ts`

**Do NOT edit:** model-call behavior, rate-limit/quota logic, provider search/admin code.

## Tasks
- [ ] Create `lib/diagnosis-wire/extract-thought.ts` — canonical `<thought>` extraction
- [ ] Create `lib/diagnosis-wire/extract-json.ts` — canonical JSON extraction (`<json>`, fenced, raw object)
- [ ] Create `lib/diagnosis-wire/diagnosis-wire-schema.ts` — `DiagnosisWireJsonV2` type matching `buildCompatibleResponseText`
- [ ] Move shared `DiagnosisData` out of `chat/components/types.ts` → `features/diagnosis/types.ts`
- [ ] Replace duplicate parser usage in diagnosis, chat, and processing flows with canonical module
- [ ] Add golden test cases if repo has test infrastructure
- [ ] Remove stale parser helpers only after all imports migrated

## Verification Checklist
- [ ] `<thought>...</thought><json>...</json>` payload parses correctly
- [ ] NDJSON `complete.full` payload parses
- [ ] Old rows with `thinking` but no `thought` still display
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
