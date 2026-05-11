# Change Summary Template (250-500 words)

Use this template for each pushed change set. Keep the final content between 250 and 500 words, written in British English.

## Release Label

`vX.Y.Z` or `update-YYYY-MM-DD-short-tag`

## GitHub Commit Comment

Use a brief label-only message, for example:
- `v1.6.0`
- `update-2026-04-13-diagnosis-flow`
- `patch-analytics-cache`

## Connector Summary

This update improves **[feature or workflow]** by refining **[core behaviour]** and reducing friction in **[user/developer path]**. The principal logic change is **[what changed logically]**, which now **[new behaviour]** instead of **[old behaviour]**. This decision was made to **[primary reason: correctness, reliability, performance, maintainability, user clarity]**.

Implementation focused on **[key module(s)/file area(s)]**. We introduced **[new component/function/data shape]** and adjusted **[existing layer]** so that **[interaction between systems]** remains consistent. Where relevant, validation now handles **[edge case(s)]**, preventing **[undesired behaviour]** in scenarios such as **[example]**. We also standardised **[naming/state handling/error pathway]** to make future updates safer and easier to reason about.

From a behavioural perspective, users now experience **[observable outcome]**. Internally, the system now **[internal outcome: fewer retries, cleaner state transitions, reduced duplicate fetches, etc.]**. The trade-off is **[known compromise]**, which is acceptable because **[justification]**. Any compatibility considerations were addressed by **[migration/fallback/guard logic]**.

Testing and verification covered **[unit/integration/manual checks]**, including **[important scenarios]**. No regressions were observed in **[critical flows]**. Remaining follow-up work includes **[optional next tasks]**, primarily to **[future objective]** rather than to resolve functional blockers.

## Linear Update

Post an expanded version of the connector summary to Linear, keeping:
- the same release label;
- clear explanation of the logical changes and rationale;
- concrete implementation details and observed impact on users/systems;
- brief note of verification scope and follow-up actions.

# When working with the AI…