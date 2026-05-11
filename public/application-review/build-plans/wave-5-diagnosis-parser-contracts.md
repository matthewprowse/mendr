# Wave 5 Build Plan: Diagnosis Parser And Contract Consolidation

## Goal

Create one canonical diagnosis wire parser and align shared diagnosis types with the JSON emitted by `/api/diagnose`.

## Source Reports

- `../diagnosis-ai-enrichment/diagnosis-pipeline-parsing-audit.md`
- `../consumer-ui/shared-ui-state-duplication-audit.md`

## Scope

Files this agent may edit:

- `app/src/lib/parse-diagnosis-from-model-response.ts`
- `app/src/lib/utils.ts`
- New parser module under `app/src/lib/diagnosis-wire/**`
- `app/src/app/chat/components/types.ts`
- New shared type module such as `app/src/features/diagnosis/types.ts` or `app/src/lib/contracts/diagnosis.ts`
- `app/src/app/diagnosis/client.tsx`
- `app/src/app/chat/components/chat-page-client.tsx`
- `app/src/features/diagnosis/processing-orchestrator.ts`
- `app/src/lib/diagnosis-persist-shape.ts`
- `app/src/lib/diagnosis-display.ts`

Files this agent must not edit:

- AI model-call behavior in `api/diagnose/route.ts` except import/type adjustments
- Rate-limit/quota logic
- Provider search/admin code

## Tasks

- [ ] Add canonical thought extraction helper.
- [ ] Add canonical JSON extraction helper for `<json>`, fenced JSON, and raw object fallback.
- [ ] Add `DiagnosisWireJsonV2` schema/type matching `buildCompatibleResponseText`.
- [ ] Move shared `DiagnosisData` out of `chat/components/types.ts` or re-export it from a canonical module.
- [ ] Replace duplicate parsing in diagnosis, chat, and processing flows.
- [ ] Add golden test cases if the repo has a suitable test pattern; otherwise document manual fixtures.
- [ ] Remove stale parser helpers only after all imports are migrated.

## Safety Constraints

- Preserve the public wire format.
- Do not change model prompts or generated JSON shape in this wave.
- Keep backwards compatibility for existing persisted diagnosis rows.
- Avoid large UI rewrites; only touch UI where parser imports change.

## Validation

Run from `app`:

- `npm run lint`
- `npm run build`
- `npm run test:diagnose-prompts`
- `npm run test:match-flow` if parser changes touch match flow

Targeted checks:

- Existing `<thought>...</thought><json>...</json>` payload parses.
- NDJSON `complete.full` payload parses.
- Old rows with `thinking` but no `thought` still display.
- `rg "tryParseDiagnosisJson|extractParsedRecord|parseThoughtFromResponse"` shows only canonical or compatibility wrappers.

## Suggested Agent Prompt

Consolidate diagnosis parsing and contracts only. Preserve output format and persisted data compatibility. Do not modify AI cost/timeout logic. Return parser behavior changes, compatibility notes, and validation results.
