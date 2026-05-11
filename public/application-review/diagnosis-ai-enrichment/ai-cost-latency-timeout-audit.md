# AI Cost, Latency, And Timeout Audit

## Executive Summary

Diagnosis uses Gemini `gemini-2.5-flash` through `getDiagnosisModel()`/`getGeminiModel()`. A full diagnosis normally performs two sequential model calls: `runClassification` followed by `runProseGeneration`. In streaming image flows, the route can add a parallel quick-thought stream, turning a request into three Gemini calls. The processing orchestrator can also fire an `image_thought_only` warm-up request before the full diagnosis, creating another potential duplicate vision call.

Reliability gaps include no explicit `maxDuration` on `/api/diagnose`, no application-level timeout around image fetches or Gemini calls, and a non-atomic daily quota read/upsert.

## Model Call Flow

```text
Full non-stream diagnosis:
  runClassification(contents)
  -> runProseGeneration(contents, classification)

Streaming image diagnosis:
  quickModel.generateContentStream(quickThoughtContents)
  + runClassification(contents) in parallel
  -> runProseGeneration(contents, classification)

Processing orchestrator with photo:
  fire-and-forget /api/diagnose analysisPhase=image_thought_only
  -> full /api/diagnose
```

## Files And Functions Reviewed

| Area | Paths |
| --- | --- |
| Diagnosis route | `app/src/app/api/diagnose/route.ts` |
| Classification | `app/src/app/api/diagnose/agent-classify.ts` |
| Prose | `app/src/app/api/diagnose/agent-prose.ts` |
| AI client | `app/src/lib/ai-client.ts`, `app/src/lib/ai-diagnosis-backend.ts` |
| AI logging | `app/src/lib/ai-logging.ts` |
| Processing | `app/src/features/diagnosis/processing-orchestrator.ts` |
| Parts price follow-up | `app/src/lib/parts-prices/extract-price.ts`, `lookup.ts`, `app/src/app/api/parts-prices/route.ts` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| AI-CL-01 | High | High | No `export const maxDuration` in `app/src/app/api/diagnose/route.ts`; `parts-prices` has one. | Long multimodal requests can be killed by platform defaults. | Add explicit `maxDuration` based on measured p95/p99. |
| AI-CL-02 | High | High | Quota logic reads current count then fire-and-forget upserts `currentCount + 1`. | Concurrent first messages can exceed quota. | Use atomic SQL/RPC increment with row lock or conditional update. |
| AI-CL-03 | Medium | High | Streaming image path can run quick thought stream plus 2a and 2b. | 3 model calls and duplicated image-token cost. | Gate/remove quick stream or use cheaper model for quick thought. |
| AI-CL-04 | Medium | High | Same multimodal `contents` sent to 2a and 2b. | Repeated vision input cost. | Use smaller classification input, prior image summary, or future single-call design. |
| AI-CL-05 | Medium | High | Remote image `fetch(img)` has no explicit timeout. | Hung image fetch can consume request budget. | Add `AbortSignal.timeout`. |
| AI-CL-06 | Medium | Medium | Gemini SDK calls are not wrapped in app-level deadlines. | Stalled model calls hold serverless invocation until killed. | Wrap model calls in timeout helper and structured cancellation where possible. |
| AI-CL-07 | Medium | High | `processing-orchestrator.ts` fires `image_thought_only` then full diagnosis. | Duplicate vision processing and cost. | Remove or feature-flag warm-up request. |
| AI-CL-08 | Low | High | Stream catch logs to console but may not call `logAiEvent` with status error. | Streamed AI failures under-reported. | Add structured error log in NDJSON stream catch. |
| AI-CL-09 | Low | Medium | Timing for 2b uses pipeline start timestamp. | Misleading latency metrics. | Use per-stage start marks. |
| AI-CL-10 | Low | High | `runImageTiering` is unused despite tiering env/model support. | Dead operational knob. | Integrate or delete. |

## Cost Opportunities

1. Remove the `image_thought_only` prefetch in flows that already use streaming.
2. Gate quick thought streaming behind a feature flag or only use it for slow network cases.
3. Use a cheaper model for classification or quick thought if quality holds.
4. Avoid sending full images to both classification and prose if an intermediate image summary is enough.
5. Keep `expected_parts` lean to limit follow-up `parts-prices` calls.
6. Add route-level metrics for model call count per diagnosis.

## Timeout And Quota Reliability

### Missing Route Duration

`/api/diagnose` is heavier than `/api/parts-prices` but does not set a route duration. Add an explicit duration export and watch logs for p95/p99.

### External I/O Timeouts

Add deadlines for:

- Image URL fetches.
- Gemini `generateContent`.
- Gemini `generateContentStream`.

### Quota Atomicity

Replace:

```text
select current count
if below limit
void upsert count + 1
```

with:

```text
transactional increment if count < limit
return new count / limit decision
```

## Suggested PR-Sized Fixes

1. Add `maxDuration` to `/api/diagnose`.
2. Implement atomic diagnosis quota increment.
3. Add `AbortSignal.timeout` around image fetch.
4. Add structured `logAiEvent` error logging for stream failures.
5. Gate or remove `image_thought_only` warm-up.
6. Wire `usedGenerateContentFallback` to actual fallback flags or remove it.
7. Delete or integrate `image-tier.ts`.
