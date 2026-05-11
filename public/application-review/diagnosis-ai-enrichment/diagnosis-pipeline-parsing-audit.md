# Diagnosis Pipeline And Parsing Audit

## Executive Summary

`POST /api/diagnose` implements a v2 two-agent Gemini pipeline: classification (`runClassification`) followed by prose generation (`runProseGeneration`). The route then re-serializes the result into the legacy wire format `<thought>...</thought><json>...</json>` through `buildCompatibleResponseText`.

The main risks are duplicated JSON/thought parsing logic across server, scan, and chat flows; a weak Zod warning schema that allows `{}`; stale telemetry and image-tiering fields; and type drift between emitted diagnosis JSON and `DiagnosisData` in `chat/components/types.ts`.

## Pipeline Map

```text
POST /api/diagnose
  -> rate limit + quota
  -> parse image/text/history/provider context
  -> build Gemini contents and prompt
  -> optional quick thought stream
  -> Agent 2a: runClassification
  -> Agent 2b: runProseGeneration
  -> buildCompatibleResponseText
  -> text/plain or NDJSON
  -> client parser
  -> persist/display helpers
```

## Files And Functions Reviewed

| Area | Path | Symbols |
| --- | --- | --- |
| API route | `app/src/app/api/diagnose/route.ts` | `POST`, `buildCompatibleResponseText`, thought extraction helpers |
| Classification | `app/src/app/api/diagnose/agent-classify.ts` | `runClassification`, schemas |
| Prose | `app/src/app/api/diagnose/agent-prose.ts` | `runProseGeneration`, `normaliseProse` |
| Validation | `app/src/app/api/diagnose/diagnosis-json-validate.ts` | `logIfDiagnosisJsonShapeUnexpected` |
| Prompts | `app/src/app/api/diagnose/prompts/*` | system/user/output format builders |
| Client parsing | `app/src/lib/parse-diagnosis-from-model-response.ts`, `app/src/lib/utils.ts` | parser utilities |
| Stream parsing | `app/src/lib/diagnose-ndjson-stream.ts` | `consumeDiagnoseNdjsonStream` |
| Types | `app/src/app/chat/components/types.ts` | `DiagnosisData` |
| Processing | `app/src/features/diagnosis/processing-orchestrator.ts` | `runDiagnosisProcessingPipeline` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| AI-DP-01 | High | High | JSON extraction exists in `parse-diagnosis-from-model-response.ts`, `utils.tryParseDiagnosisJson`, and inline `chat-page-client.tsx` parsing. | Chat and scan can parse the same payload differently. | Create one canonical diagnosis wire parser. |
| AI-DP-02 | High | High | `DiagnosisData` omits fields emitted by `buildCompatibleResponseText`, causing `as any` usage in UI. | TypeScript cannot protect persisted/displayed diagnosis shape. | Add `DiagnosisWireJsonV2` and align `DiagnosisData`. |
| AI-DP-03 | Medium | High | `diagnosis-json-validate.ts` schema has all fields optional and `.passthrough()`. | `{}` passes; shape drift warnings are weak. | Require core keys or add refinements for post-merge payload. |
| AI-DP-04 | Medium | High | Validation runs on server-assembled JSON, not raw model output. | Model schema drift can be hidden by merge/coercion. | Log validation against raw 2a/2b results and final merged payload separately. |
| AI-DP-05 | Medium | High | `recordStage` calls for 2a and 2b both use pipeline start. | `agent2b_prose_ms` is cumulative, not prose-only. | Use per-stage timestamps. |
| AI-DP-06 | Medium | High | `image-tier.ts` exists, but route metadata fields remain static and no import uses `runImageTiering`. | Logs imply image tiering exists when it does not. | Delete or wire image tiering. |
| AI-DP-07 | Low | High | `hasSpringSignal` and `countSpringSignals` are both defined inside `route.ts` (lines ~820-823). `countSpringSignals` is never called outside its definition closure; `hasSpringSignal` only exists to support it. Neither function affects any branch or output. | Verified dead code in a large hot-path file. | Remove both definitions. |
| AI-DP-08 | Medium | Medium | Prompt user-turn prefix still includes legacy tag/JSON output instructions for a structured two-agent pipeline. | Extra tokens and mixed instructions. | Create v2-specific prompt prefix without monolithic output block. |
| AI-DP-09 | Medium | High | Chat provider gating uses a literal confidence threshold instead of shared diagnosis confidence constant. | Drift from configurable threshold. | Import the shared constant everywhere. |
| AI-DP-10 | Low | High | `usedGenerateContentFallback` is always false in logging metadata. | Misleading observability. | Remove or set from actual fallback flags. |

## Parser And Schema Duplication Map

| Concern | Locations |
| --- | --- |
| Thought extraction | `route.ts`, `diagnosis/client.tsx`, `chat-page-client.tsx` |
| JSON extraction | `parse-diagnosis-from-model-response.ts`, `utils.ts`, `chat-page-client.tsx` |
| Wire schema | Gemini schemas in agent files; loose Zod warn schema in `diagnosis-json-validate.ts` |
| Display coercion | `parse-diagnosis-from-model-response.ts`, chat inline logic, diagnosis UI |

Recommended shared module:

```text
app/src/lib/diagnosis-wire/
  extract-thought.ts
  extract-json.ts
  diagnosis-wire-schema.ts
  to-diagnosis-data.ts
```

## Stale Compatibility Branches

- `thinking` duplicates `thought` for legacy clients.
- Deprecated cost-range fields are still emitted or coerced.
- `image_thought_breakdown` mirrors `image_descriptions`.
- `output-format-blocks.ts` is deprecated and appears unused.
- Chat duplicate file `chat-page-client 2.tsx` contains parallel parser logic.

## Suggested PR-Sized Fixes

1. **Canonical parser module**: move thought/JSON extraction into one library with tests.
2. **Wire type alignment**: create `DiagnosisWireJsonV2` and update `DiagnosisData`.
3. **Telemetry cleanup**: fix per-stage timings, remove stale fallback field, and resolve image-tiering metadata.
4. **Validation hardening**: make shape warnings meaningful for required post-merge fields.
5. **Prompt hygiene**: create v2-specific prompt prefix.
6. **Dead code cleanup**: remove unused spring helpers, deprecated output block placeholder, and duplicate chat client after verification.
