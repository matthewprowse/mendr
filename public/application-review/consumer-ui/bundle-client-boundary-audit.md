# Bundle And Client-Boundary Audit

## Executive Summary

The consumer UI contains several large `use client` boundaries that combine network orchestration, storage, maps, image processing, polling, and rendering in single modules. The largest surfaces are:

- `app/src/app/chat/components/chat-page-client.tsx` at roughly 2,500+ lines.
- `app/src/app/diagnosis/client.tsx` at roughly 1,700+ lines.
- `app/src/app/match/components/client.tsx` at roughly 1,200+ lines.
- `app/src/app/design/client.tsx` at roughly 1,100+ lines.
- `app/src/app/start/client.tsx` at roughly 1,000 lines.

The highest-value bundle improvements are lazy-loading HEIC conversion, deferring Google Maps initialization, splitting match filters/enrichment, isolating processing animation, and server-splitting the design preview route. Several heavy or duplicate clients also appear unused and should be deleted before deeper refactors.

## Files And Components Reviewed

| Area | Files |
| --- | --- |
| Diagnosis | `app/src/app/diagnosis/client.tsx`, `app/src/app/diagnosis/[id]/page.tsx` |
| Match | `app/src/app/match/components/client.tsx`, `app/src/app/match/page.tsx`, `app/src/app/match/[id]/page.tsx` |
| Start | `app/src/app/start/client.tsx`, `app/src/app/start/page.tsx` |
| Design | `app/src/app/design/client.tsx`, `app/src/app/design/page.tsx` |
| Chat | `app/src/app/chat/components/chat-page-client.tsx`, `app/src/app/chat/components/providers-map.tsx` |
| Processing | `app/src/app/processing/[conversationId]/client.tsx`, `app/src/app/processing/[conversationId]/page.tsx` |
| Map hooks | `app/src/features/match/hooks/use-match-map.ts` |
| Match UI | `app/src/app/match/components/filter-sheet.tsx`, `match-map-sheet-layout.tsx`, `distance-histogram.tsx` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| UI-BU-01 | High | High | `diagnosis/client.tsx` imports `heic2any` at top level and uses conversion helpers for optional HEIC uploads. | Diagnosis route pays for HEIC conversion code even when not needed. | Dynamically import `heic2any` inside the conversion function. |
| UI-BU-02 | High | High | `match/components/client.tsx` imports map, filter, provider card, enrichment, cache, and location logic into one client boundary. | Large initial JS and high hydration surface for `/match`. | Extract enrichment/location hooks; dynamic-load `FilterSheet` only when open. |
| UI-BU-03 | High | High | `features/match/hooks/use-match-map.ts` initializes Google Maps when location/map state is available. | Map boot can dominate mobile route transition. | Initialize on intersection, user intent, or expanded map sheet. |
| UI-BU-04 | Medium | High | `chat/components/providers-map.tsx` uses Google Maps and route libraries separately from match map hook. | Duplicate Google Maps integration and potentially heavier library load. | Split basic-marker map from routed map and share loader/options helpers. |
| UI-BU-05 | Medium | High | `start/client.tsx` imports Google Maps loader at module level, while Places autocomplete is only needed in the location step. | `/start` initial payload includes code users may never need. | Dynamic import loader inside the location step effect. |
| UI-BU-06 | Medium | High | `design/client.tsx` is a single large client file with broad shadcn and icon imports. | Design preview ships a large client bundle for mostly static content. | Render static showcase sections as server components; keep interactive demos as small client islands. |
| UI-BU-07 | Medium | High | `chat-page-client.tsx` is a large monolith but `/chat/page.tsx` redirects and does not render it. | Potentially dead code with high maintenance cost. | Confirm product intent; delete or rehome if unused. |
| UI-BU-08 | Medium | High | `processing/[conversationId]/client.tsx` imports `framer-motion` in the start-to-processing funnel. | Adds animation runtime to a critical post-start path. | Replace with CSS transitions or lazy-load a small animated child. |
| UI-BU-09 | Low | High | `match/components/client.tsx` persists match cache during several state changes and enrichment updates. | Repeated sessionStorage serialization can cause jank. | Debounce cache writes and flush on `pagehide`/visibility changes. |
| UI-BU-10 | Low | Medium | `filter-sheet.tsx` has body scroll-lock logic while map sheet layout also controls mobile layout. | Risk of stuck or conflicting scroll behavior on mobile. | Centralize scroll-lock policy for sheet overlays. |

## Heavy Dependency Map

### Google Maps

- `app/src/features/match/hooks/use-match-map.ts`: imports `@googlemaps/js-api-loader`, initializes `maps` and `marker`.
- `app/src/app/chat/components/providers-map.tsx`: imports the same loader and also uses route-related map behavior.
- `app/src/app/start/client.tsx`: uses Places autocomplete for the location step.

Recommendation: centralize map loader configuration and split map modes by feature need:

```text
basic map mode: maps + marker
routed map mode: maps + marker + routes
places input mode: places only, loaded in location step
```

### Images And HEIC

- `app/src/app/diagnosis/client.tsx` handles HEIC conversion.
- Move conversion dependency behind dynamic import to avoid paying for it on ordinary JPEG/PNG flows.

### Motion

- `app/src/app/processing/[conversationId]/client.tsx` imports `framer-motion`.
- Marketing routes also use motion, but processing sits in the main scan funnel and should be kept lean.

### Charts

- `recharts` is present, mostly used through `components/ui/chart.tsx` and admin analytics. It was not a primary consumer-route dependency in the reviewed match/diagnosis/start files.

### Icons

- `@phosphor-icons/react`, `lucide-react`, and local icon wrappers are used across large clients. Avoid broad imports in large showcase/demo clients; prefer per-icon imports through a single wrapper if the bundle analyzer confirms savings.

## Client Boundary Extraction Opportunities

### `app/src/app/diagnosis/client.tsx`

Extract:

- `features/diagnosis/image-normalization.ts`: HEIC and renderable image helpers.
- `useDiagnosisRun`: initial diagnosis run orchestration.
- `useDiagnosisProviderHydration`: optional provider hydration/refetch behavior.
- `DiagnosisRefineOverlay` and `DiagnosisFullscreenGallery`: overlay UI currently embedded in the large client.

### `app/src/app/match/components/client.tsx`

Extract:

- `useMatchEnrichmentQueue`: `pollEnrichment`, queueing, and enrichment state updates.
- `useMatchLocationActions`: address geocoding and current-location flows.
- Dynamic `FilterSheet`: only import when `isFilterSheetOpen`.
- Debounced cache persistence module.

### `app/src/app/start/client.tsx`

Extract:

- Step components: describe, photos, location.
- `usePlacesAutocompleteForStartStep`: dynamically import the Google loader only when step 3 is active.

### `app/src/app/design/client.tsx`

Split:

- Server-rendered docs: typography, colors, spacing, static cards.
- Client islands: dialog, sheet, dropdown, tabs, and other interactive demos.

### `app/src/app/chat/components/chat-page-client.tsx`

If retained, split:

- `useChatBootstrap`
- `useDiagnosisConversationFlow`
- `useDirectTradeProviderFlow`

If not retained, remove it and its duplicate `chat-page-client 2.tsx`.

## Runtime And Render Risks

- Map initialization can occur before clear user intent.
- Enrichment polling updates can cause repeated provider-list renders.
- Session/cache writes are not obviously debounced.
- Multiple overlay systems can fight over scroll locking.
- Large client modules make hook dependencies harder to reason about.
- Dead duplicate client files can accidentally become import targets.

## Suggested PR-Sized Fixes

1. **Lazy HEIC conversion** in `diagnosis/client.tsx`.
2. **Dynamic-load `FilterSheet`** in `match/components/client.tsx`.
3. **Defer match map boot** in `use-match-map.ts`.
4. **Split `ProvidersMap` modes** into basic and routed map variants.
5. **Dynamic-load Places** in the location step of `start/client.tsx`.
6. **Server-split design preview** so only demos are client-side.
7. **Extract match enrichment hook** without changing behavior.
8. **Debounce match cache persistence**.
9. **Isolate processing animation** or replace `framer-motion` with CSS.
10. **Delete dead/duplicate clients** after import verification.

## Priority

Do first:

- Lazy HEIC import.
- Dynamic match filter sheet.
- Dynamic Places loader.
- Debounced match cache writes.

Do next:

- Map initialization deferral.
- Match/diagnosis hook extraction.
- Design page server split.

Do after cleanup verification:

- Remove dead chat/match/diagnosis variants and `* 2.*` files.
