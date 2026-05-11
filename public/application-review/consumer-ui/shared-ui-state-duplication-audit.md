# Shared UI, State, And Duplication Audit

## Executive Summary

The largest confirmed duplication issue in the consumer UI is the broad set of `* 2.*` files and deprecated re-export shims. Most are thin re-exports, but `app/src/app/chat/components/chat-page-client 2.tsx` is a near-complete duplicate of the already-large `chat-page-client.tsx`.

Shared domain contracts also live under route-local paths. `DiagnosisData`, `Provider`, and `Message` are defined in `app/src/app/chat/components/types.ts` but are imported by libraries, feature modules, diagnosis, match, report, and components. This makes the `chat` route folder a hidden shared-contract owner.

Match state/cache ownership is split across `features/match/cache/match-page-cache.ts`, `use-match-providers.ts`, and prefetch calls from diagnosis/processing flows. This is workable, but should be documented and consolidated where possible.

## Files And Modules Reviewed

| Area | Paths |
| --- | --- |
| Shared components | `app/src/components` |
| Match feature | `app/src/features/match` |
| Diagnosis feature | `app/src/features/diagnosis` |
| Chat shared UI | `app/src/app/chat/components`, `app/src/app/chat/_components` |
| UI primitives | `app/src/components/ui` |

## Findings

| ID | Severity | Confidence | Evidence | Impact | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| UI-DU-01 | High | High | `app/src/app/chat/components/chat-page-client 2.tsx` is a large duplicate of `chat-page-client.tsx`. | Merge drift and accidental edits to wrong file. | Diff once, preserve unique logic if any, then delete the duplicate. |
| UI-DU-02 | Medium | High | `DiagnosisData` and `Provider` are defined under `app/src/app/chat/components/types.ts` but imported by libs/features/routes. | Route deletion/refactor can break unrelated code. | Move shared contracts to `features/diagnosis/types.ts` or `lib/contracts`. |
| UI-DU-03 | Medium | High | `features/match/contracts.ts` defines `MatchProvider`; chat types define another `Provider` shape. | Adapter bugs around `placeId`/`place_id`, nullable fields, and profile IDs. | Create one provider contract or explicit adapter module. |
| UI-DU-04 | Medium | Medium-High | `match-page-cache.ts` stores conversation-level match cache; `use-match-providers.ts` stores viewport provider cache. | Stale-data behavior is hard to reason about. | Centralize cache helpers or document precedence and TTL policy. |
| UI-DU-05 | Low-Medium | High | `app/src/app/chat/_components` contains deprecated one-line re-export shims. | Extra indirection and misleading import surface. | Migrate any imports to `chat/components`, then delete `_components`. |
| UI-DU-06 | Low | High | `features/match/hooks/useMatch*.ts` and `useMatch* 2.ts` re-export kebab-case hook files. | Redundant import paths and naming drift. | Delete camelCase and ` 2` shims after grep verification. |
| UI-DU-07 | Low | High | `app/src/components/ui/select 2.tsx` re-exports `./select`. | Tooling noise and accidental import target. | Delete. |
| UI-DU-08 | Medium | Medium | `providers-map.tsx` and `use-match-map.ts` are separate Google Maps integrations. | Loader/options/lifecycle duplication. | Extract shared map loader/options helper; do not force a full UX merge. |

## Duplicate File Inventory

High-confidence `* 2.*` cleanup candidates in scope:

- `app/src/components/ui/select 2.tsx`
- `app/src/features/match/hooks/useMatchMap 2.ts`
- `app/src/features/match/hooks/useMatchProviders 2.ts`
- `app/src/features/match/hooks/useMatchConversationContext 2.ts`
- `app/src/app/chat/components/chat-page-client 2.tsx`
- `app/src/app/chat/components/chat-message 2.tsx`
- `app/src/app/chat/components/chat-footer 2.tsx`
- `app/src/app/chat/components/chat-welcome 2.tsx`
- `app/src/app/chat/components/diagnosis-report 2.tsx`
- `app/src/app/chat/components/diagnosis-response-card 2.tsx`
- `app/src/app/chat/components/inline-diagnosis-block 2.tsx`
- `app/src/app/chat/components/provider-card 2.tsx`
- `app/src/app/chat/components/providers-map 2.tsx`
- `app/src/app/chat/components/report-card 2.tsx`
- `app/src/app/chat/components/service-trade-link 2.tsx`
- `app/src/app/chat/components/skeletons 2.tsx`
- `app/src/app/chat/components/types 2.ts`
- `app/src/app/chat/components/unrelated-image-card 2.tsx`
- `app/src/app/chat/components/unserviced-category-card 2.tsx`

Most are re-export shims. `chat-page-client 2.tsx` should be handled separately because it is substantive.

## Deprecated Shim Inventory

### Chat `_components`

Files under `app/src/app/chat/_components` re-export from `../components` and are marked deprecated. Current guidance should be to import from `chat/components` directly, then delete the `_components` folder when references are zero.

### Match Hook Shims

Canonical implementations are kebab-case:

- `use-match-map.ts`
- `use-match-providers.ts`
- `use-match-conversation-context.ts`

Deprecated/copy surfaces:

- `useMatchMap.ts`
- `useMatchProviders.ts`
- `useMatchConversationContext.ts`
- matching `* 2.ts` files

## State And Cache Ownership Issues

### Match Page Cache

`app/src/features/match/cache/match-page-cache.ts` owns conversation-scoped match page cache with memory and sessionStorage storage. It is written by processing/diagnosis prefetch flows and consumed by match pages.

### Viewport Provider Cache

`app/src/features/match/hooks/use-match-providers.ts` owns a separate viewport/request-key cache, with a shorter TTL. This is reasonable for map viewport UX but should be documented as distinct from conversation prefetch cache.

### Diagnosis Handoff

`app/src/features/diagnosis/scan-session-store.ts` uses a dedicated sessionStorage key for start/diagnosis handoff. Match has its own trade/context handoff path. These should be documented as flow-state boundaries.

### Chat Route As Shared Library

Shared types and provider cards/maps living under `app/src/app/chat/components` create an ownership mismatch. If `/chat` is retired, shared modules must be moved before deleting the folder.

## Suggested Canonical Layout

```text
app/src/features/diagnosis/
  types.ts
  scan-session-store.ts
  processing-orchestrator.ts

app/src/features/match/
  contracts.ts
  cache/
    match-page-cache.ts
    providers-viewport-cache.ts
  hooks/
    use-match-map.ts
    use-match-providers.ts
    use-match-conversation-context.ts

app/src/features/provider-ui/
  provider-card.tsx
  providers-map.tsx
  report-card.tsx
```

## Suggested PR-Sized Fixes

1. **Dead shim cleanup**: remove `select 2.tsx`, match hook shims, and chat `* 2` re-export shims after import verification.
2. **Large duplicate cleanup**: diff and delete `chat-page-client 2.tsx`.
3. **Types migration**: move `DiagnosisData` and related shared contracts from `chat/components/types.ts` into `features/diagnosis/types.ts` or `lib/contracts`.
4. **Cache documentation**: document match page cache vs viewport provider cache TTL and ownership.
5. **Map helper sharing**: extract Google Maps loader/options setup into a shared helper while preserving separate UX components.
