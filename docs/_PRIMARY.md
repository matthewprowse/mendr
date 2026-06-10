
**This is an important document that cannot be modified or deleted under any circumstances.**

---

## App Design Requirements

---

#### Colours

The colour palette is the neutral ShadCN theme defined as CSS variables in `globals.css`, and colours are always taken from those tokens rather than written as raw hex values. The same tokens drive both light and dark mode, so referencing a token rather than a fixed colour keeps a screen correct in either mode.

Primary text uses `foreground`, and secondary or supporting text uses `secondary` or `muted-foreground`. The page background uses `background` and raised surfaces use `card`, while hover and selected states use `accent` and `muted`. Every divider and outline uses `border`. Colour from outside this neutral palette is never introduced for decoration, and `destructive` is the only accent, reserved for errors and destructive actions.

---

#### Dark Mode

The application is built for light mode for now. A `.dark` theme exists in `globals.css`, but dark mode is not a shipping target yet, so screens are designed and verified in light mode only. Because every colour is referenced through a token rather than a fixed value, dark mode stays achievable later without reworking individual screens, and no screen should hardcode a colour that would prevent that.

---

#### Radius & Elevation

Corner radius follows a small fixed scale. Controls such as buttons, inputs, and small interactive elements use `rounded-md`, cards and larger surfaces use `rounded-lg`, and fully rounded elements such as avatars and pills use `rounded-full`. Elevation is kept light: cards carry the default `shadow-sm` and nothing heavier is introduced. Depth is expressed through the `border` and surface tokens rather than through strong shadows.

---

#### Casing

Screen titles, section headings, labels, field names, stat names, navigation items, badges, and button labels use Title Case, for example "First Pass Accuracy", "New Diagnosis", or "Recommended Pros". Body copy, descriptions, helper text, and supporting paragraphs use sentence case. All caps is never used for emphasis.

---

#### Dates, Numbers & Data

Dates and numbers are always formatted through the shared helpers, never by hand. Long dates use `formatLongDate` and render as "Thursday, 30 May 2026", relative dates render as "Today", "Yesterday", or "5 Days Ago", and money is formatted through `format-money.ts`. Counts that include a noun are pluralised through the helpers, such as `proCount`, so a count reads as "1 Pro" or "3 Pros".

All numbers shown to a user come from real data, normally a Supabase query or RPC. Placeholder copy may stay as Lorem ipsum until the real wording exists, but a statistic or count is never faked or hardcoded to look populated. If the real number is not available yet, the loading or empty state is shown instead.

---

#### Responsive & Mobile

The application is mobile first. Layouts are designed for a narrow screen and then allowed to widen into the centred column, and the full-height shell keeps the top bar and bottom navigation fixed while only the middle region scrolls. Sticky bars respect the device safe areas so they clear notches and home indicators on mobile. Breakpoints use the standard Tailwind prefixes, and a screen is verified at a narrow width first before its wider layout is checked.

---

#### Input Requirements

Inputs are built with the default ShadCN `input` and `label` components, composed through the ShadCN `form` and `field` components with `react-hook-form` and its resolvers handling state and validation. A label sits `gap-3` above its input, and any sub-label or helper text that appears below the input sits `gap-2` beneath it as `text-xs text-muted-foreground`.

When an input has a maximum property, the count is shown on the right-hand side of the ShadCN `label` component, formatted as "[x] / [xxx]" in `text-xs text-muted-foreground`.

Validation messages appear below the input as `text-sm text-destructive`, and the invalid input carries `aria-invalid` so its border reflects the error state. Inputs always stretch to the full width of their column rather than being sized to their content, and placeholder text is used only for examples or hints, never as a replacement for a label.

---

#### Typography

`text-sm` is the default primary text throughout the application. `text-xs` is the secondary or smaller body text, used for sub-labels, helper text below buttons, and other helper text. `text-xs` should only ever use `text-muted-foreground` as its colour.

Page titles are `text-2xl font-semibold` in `text-foreground`. Section headings are `text-lg font-semibold`. The brand name or screen name shown in the top bar is `text-base font-medium`. List row titles, field labels, and other emphasised inline text are `text-sm font-medium`.

The font family is the default `font-sans` defined in `globals.css` and is never set by hand. Only the sizes above are used, and arbitrary sizes such as `text-[13px]` are not permitted. Every page title is immediately followed by a single supporting paragraph in `text-sm text-muted-foreground`.

---

#### Spacing & Layout

The content of every screen sits in a single centred column, constrained with `mx-auto`. The standard width is `max-w-xl`, which the whole customer app uses; a wider `max-w-3xl` or `max-w-5xl` is reserved for a screen that genuinely needs to hold more.

The page and its footer use `p-4` for their padding. Distinct sections within a screen are separated by `gap-8`, content grouped inside a card or a form group sits `gap-4` apart, and a label and its input sit `gap-3` apart. List rows are spaced by their own `py-3` and a `Separator` rather than by a flex gap. Spacing values are taken from this scale rather than chosen arbitrarily, so that every screen shares the same rhythm.

When a body section is a form, its content is centred both vertically and horizontally and its text is centred throughout, with the exception of input labels and similar, which keep their normal left alignment.

---

#### Page Shell

Every full screen is built on the same shell so that screens line up with one another. The outer container is `fixed inset-0 z-0 flex flex-col overflow-hidden bg-background`. Inside it sits a sticky top bar, a single scrolling region in the middle (`flex-1 overflow-hidden` wrapping `h-full overflow-y-auto`) whose content sits in the centred `max-w-xl` column, and a fixed bottom navigation bar.

The top bar is the `FlowTopBar` component, passed `className="p-4"` so its padding matches the page. It carries a single back control on the left as a `ghost` icon button, the brand name or current screen name centred as `text-base font-medium text-foreground`, and the `UserAvatar` on the right. On a long screen the centred label may swap from the brand name to the screen title once the page heading scrolls out of view.

The bottom navigation is the `AccountTabBar` on the customer side and the `ProTabBar` on the Pro side. It is `sticky bottom-0 shrink-0 bg-background p-4` with its own centred `max-w-xl` row, uses `Tabs` for the destinations with longest-prefix matching to resolve the active tab, and on the customer side carries a central `size-12 rounded-full shadow-md` action button that starts a diagnosis. New screens compose this shell rather than inventing their own layout. The customer-facing shareable documents (report, quote, and the rate-thanks page) are the deliberate exception and use their own print-style layout.

---

#### Buttons

There is only ever one primary action visible on a screen, and it uses the default `Button` (`variant="default"`), normally full width (`w-full`) inside a form or a sticky footer. Secondary or supporting actions use `variant="secondary"`, including full-width buttons such as "New Diagnosis", "Filters", or "Contact". `variant="ghost"` covers low-emphasis actions more broadly than just icons: the icon-only controls in the top bar, the trailing action buttons on a list row, and the quieter half of a paired footer, for example "Add Details" or "Clear All" sitting beneath a primary action. `variant="outline"` is used only when an action needs a visible boundary without competing with the primary action. `variant="destructive"` is used only for the confirm action inside a destructive dialog and never as the main call to action on an ordinary screen. `variant="link"` is used for a textual link that sits inside a sentence.

The default size (`h-10`) is the standard height for an action button. `size="sm"` is used in dense areas such as toolbars and inline controls, and `size="lg"` for a prominent primary call to action. Icon-only buttons use `size="icon"`, or `icon-sm` and `icon-xs` in denser areas, and always carry an `aria-label`. Two conventions recur: the leading square on a list row is a `secondary` `size="icon"` button at `size-12`, and the trailing actions on a row are `ghost` `size="icon"` buttons at `size-8`. When a screen needs two stacked actions they sit in the footer as a primary `default` button above a `ghost` button, both `w-full`, separated by `gap-4`. Call to action labels use plain action verbs, such as Start, Review, Compare, or Contact, and stay under five words where possible.

---

#### Icons

Icons come from `lucide-react`, which is the single icon set used across the application. The other installed sets, such as Phosphor and Geist, are not reached for in new work so the visual language stays consistent. Icons placed inside a button inherit its sizing and default to `size-4`, while icons used on their own in the top bar use `strokeWidth={2.5}` to match the existing back button. An icon is decorative by default, so its meaning is always carried either by an adjacent label or by an `aria-label` on the control around it.

---

#### List Rows & Cards

Navigable lists use a row pattern, not cards. Each row uses `py-3`, with a `Separator` placed between rows but never above the first row or below the last, and it leads with a `size-12` square icon button. Beside it sits a text block: a `text-sm font-medium` title above a `text-xs text-muted-foreground` description kept to one line with `line-clamp-1`. Trailing metadata or actions, such as a date or an ellipsis menu, sit on the right as `text-xs text-muted-foreground` text or `ghost` `size-8` icon buttons. Rows are tappable and keyboard accessible, using `role="button"`, `tabIndex={0}`, and Enter or Space triggering the same action as a click.

A settings row is a variant of this pattern for a row that holds a control rather than navigating: the label and its description sit on the left and the control, usually a `Switch`, sits on the right, with the row laid out as `flex items-center justify-between gap-3 py-3`. A stack of settings rows is divided with `divide-y divide-border` rather than with individual separators.

Cards are reserved for grouped or standalone content rather than simple lists. `Card size="sm"` (`gap-3 rounded-lg p-4`) is used for compact content and tappable chips, and the default `Card` (`gap-6 rounded-xl py-6`) for larger standalone blocks. An entity card, such as a specialist result, follows the small-card shape with `flex flex-col gap-4 rounded-lg border bg-card p-4`: a `text-lg font-semibold` name, a metadata row carrying a rating and a status `Badge`, an optional `text-sm text-muted-foreground` summary, and a footer of one or two `flex-1` actions. Bespoke card styles and one-off stat tiles are not invented; these shapes are reused.

---

#### Charts

Data visualisation uses the ShadCN chart wrapper (`chart.tsx` and `ChartContainer`) over `recharts`, rather than hand-built SVG or a different charting library. A simple bar chart is the default, kept within the neutral palette, given a fixed aspect height, and topped with `Tabs` when the user can switch the range, such as week, month, or six months, as on the customer home screen. A chart is used only where a trend genuinely helps; a single number is shown as text, not as a chart.

---

#### Badges & Status

Status and small pieces of metadata use the ShadCN `Badge` component rather than custom pills. `variant="secondary"` is the default for neutral metadata, `variant="outline"` is used for quieter labels, and `variant="destructive"` is used for an error or warning state. In keeping with the Colours rule, badges stay within the neutral palette, and colour is not added to a badge purely to make it stand out.

---

#### Dialogs, Sheets & Drawers

Short confirmations and small focused tasks use `Dialog`. Destructive confirmations specifically use `AlertDialog`, with a clear title, a one-line description of the consequence, a `Cancel` action, and a `destructive` confirm action. `Sheet` is used for side panels and secondary flows that should not navigate away from the current screen. `Drawer` is used for bottom-sheet interactions on mobile, such as the clarification chips. Actions that belong to a single list row, such as pin, share, and delete, are grouped inside a `DropdownMenu` opened from an ellipsis icon button on that row.

---

#### Feedback & Toasts

Transient feedback uses the `sonner` toaster through `toast.success` and `toast.error`. A success message confirms a completed action in a short sentence, and an error message explains what failed in plain, reassuring language without technical detail. Inline, non-transient messages such as a form-level error use `text-sm text-destructive`. The `Alert` component is used for persistent in-page notices, not for transient feedback.

---

#### Empty, Loading & Error States

Every screen that loads data handles four states explicitly: loading, empty, error, and populated. Loading states use `Skeleton` placeholders that mirror the shape of the content they will replace, or the `Spinner` for a short inline wait. Empty states use a centred `text-sm text-muted-foreground` message, or the `Empty` component for richer cases. Error states use a centred `text-sm text-destructive` message written in plain language. None of these states is ever left unhandled or shown as a blank screen.

---

#### Avatars & Imagery

User identity uses the `UserAvatar` component, which falls back to initials when no image is available, and avatars never introduce colour from outside the neutral palette. Images hold their ratio with the ShadCN `AspectRatio` component and use `rounded-lg` corners to match cards. Every image carries descriptive `alt` text.

---

#### Motion & Transitions

Motion is subtle and functional. Interactive elements use the `transition-all` already built into the components, and larger animations use `framer-motion` only where movement aids understanding, such as a sheet or drawer sliding into view. Motion is never used for decoration, and anything that animates respects the user's reduced-motion preference.

---

#### Terminology & Copy

Customer-facing copy never uses the words "provider" or "contractor". The paying, business side is referred to as a "Pro" in titles, headings, and buttons, for example "Find Pros" or "Recommended Pros", and as a lowercase "specialist" or "specialists" in flowing body copy. The brand label "Mendr Pro" is left exactly as written. Every customer-facing term of this kind is read from `brand-system.ts` rather than hardcoded, so the wording can be changed in one place. Copy throughout is warm, calm, and practical, and placeholder copy stays as Lorem ipsum until the real copy is written.

---

#### Accessibility

Every interactive element is reachable and operable by keyboard. Custom interactive elements such as list rows use `role="button"`, `tabIndex={0}`, and handle both Enter and Space. Icon-only controls always carry an `aria-label`. The focus styles provided by the components are never removed, colour is never the only way meaning is conveyed, and touch targets stay comfortably large, with `size-10` as the standard size for an icon button.

---

#### Selection Controls

A choice from a list always uses the ShadCN `Select` component. The native select is never used. A single on or off setting uses `Switch`, a small set of independent options uses `Checkbox`, and a single choice from a small mutually exclusive set uses `RadioGroup`. A free-text choice with suggestions uses `Combobox`, a value within a range uses `Slider`, and a compact set of mutually exclusive view options uses `ToggleGroup`. Every control is paired with a label following the Input Requirements above.

---

#### Tabs

`Tabs` are used to switch between views of the same screen without navigating away, such as alternate cuts of the same data. They are not used for primary navigation between top-level areas, which belongs in the bottom navigation bar, and they are not used to split a single form into steps, which uses the multi-step flow pattern instead.

---

#### Tooltips, Popovers & Hover Cards

`Tooltip` is used only for a short, supplementary hint on an icon-only control, never to hold essential information, since it is not reliably available on touch. `Popover` is used for a small interactive panel anchored to a control, such as a filter or a contact action. `HoverCard` is used for a passive preview of a linked entity on pointer devices. None of these is used to carry content the screen needs in order to be understood.

---

#### Tables

The `Table` component is used only for genuinely tabular data with meaningful columns, and primarily on wider screens. Lists of records that a user taps into use the row pattern from List Rows and Cards rather than a table, since the row pattern reads better on mobile. When a table is used it keeps the neutral palette, with `text-xs text-muted-foreground` headers and `text-sm` cells.

---

#### Search & Pagination

A search field uses an `Input` with a leading `Search` icon positioned absolutely on the left and the input padded with `pl-9` to clear it, matching the History screen. Long lists are not loaded all at once: they either page with the `Pagination` component or extend with a "Load More" action, and the loading and empty states from Empty, Loading and Error States apply while results resolve.

---

#### Multi-Step Flows

Flows such as `/start`, `/diagnosis`, and `/match` reuse the shared flow primitives rather than building bespoke step layouts. `FlowTopBar` provides the sticky header with the back control, `StepHeading` provides the centred title and supporting line at the top of each step (a `text-2xl font-semibold` title with a `text-sm text-muted-foreground` line beneath), and `FlowFooter` provides the sticky bottom bar that holds the single forward action, with its inner content constrained to `max-w-sm`. Each step presents one clear task and one primary action, and the back control always returns to the previous step.

---

#### Route States & Layering

Every route provides its own loading and error handling through the framework files: `loading.tsx` for the route-level loading state, `not-found.tsx` for a missing resource, and the global error page for an unexpected failure, each built on the same shell as the screen it stands in for. Layering is kept shallow and consistent: page content sits at `z-0`, the sticky top bar and bottom navigation sit at `z-20`, and overlays such as dialogs, sheets, and toasts sit above them through their own components rather than through ad hoc z-index values.

---

## Learnings

The sections above are fixed requirements and are not changed without an explicit instruction. This Learnings section is the one place that may be edited freely, and it is maintained by the AI.

At the end of any session in which the AI has worked on the UI or UX, it records here anything that differed from the requirements above: a pattern that had to be introduced, a rule that did not fit a real screen, a decision made in the moment, or a question the requirements did not answer. Each entry is dated and written as a short, plain sentence or two, with the most recent entry first. Over time this log captures the direction the product is moving in, so that the requirements above can be revised deliberately rather than drifting on their own.

#### 6 June 2026 — Customer UI analysis

- The customer app uses `max-w-xl` as its single content width on every product screen. The wider `max-w-3xl` and `max-w-5xl` options are not currently used in the app. Now reflected in Spacing and Layout.
- `ghost` buttons are used more broadly than icon-only controls: full-width secondary text actions such as "Add Details", "Clear All", and "View More", and the trailing actions on list rows, are all `ghost`. Now reflected in Buttons.
- The customer home screen uses a `recharts` bar chart with range `Tabs`, so charts are in active use. Now documented in Charts. The earlier rejection was of a specific donut chart and bespoke stat tiles, not of charts in general.
- A few surfaces diverge from the rules and should be brought back in line over time: the match specialist card and the structured clarification card are hand-built rather than using `Card`, the match card hardcodes a yellow star fill, and the report, quote, and rate-thanks pages use a print-style gray theme (`bg-gray-50`, `text-gray-900`) instead of the neutral tokens. The shareable documents may keep a print style; the rest should move onto tokens.
- The match screen builds its own fixed 64px header instead of `FlowTopBar`; every other screen uses `FlowTopBar`.
- The Pro pages are behind the customer app: `pro/(portal)/settings` still imports `NativeSelect` (against the Select-only rule, flagged for a follow-up).
- The Pro account hub was rebuilt and moved this session. It lived at `/contractors/account` in the wrong chrome (thin contractors top nav, no `ProTabBar`, hardcoded gray theme) and was driven only by `provider_applications`, so a claimed Pro wrongly saw "Apply Now". It now lives at `/pro/account` (with 301 redirects from the old paths), inherits the Pro portal shell, and is driven by `getProviderState`. The landing is a state machine (claimed hub / pending / claim CTA). New Edit Profile (`/pro/account/edit`) and Manage Photos (`/pro/account/photos`) screens were added, backed by two new owner/admin-gated endpoints: `PATCH /api/pro/profile` (writes editable provider fields, stamping `field_sources='contractor'` so enrichment is not clobbered) and `DELETE`/`PATCH /api/pro/gallery` (session-scoped image management; uploads still use the existing `POST /api/providers/[id]/gallery` and land `status='pending'`). The `/api/contractors/account/*` API routes were intentionally left in place. The remaining Pro surfaces (settings, leads, jobs, etc.) still need the same treatment.

---
