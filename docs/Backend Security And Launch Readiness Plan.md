## Backend Security And Launch Readiness Plan

This document records every backend issue found during the full Supabase and Next.js audit of June 2026, and what must be fixed to reach a clean, safe launch. It is the companion to the Test Coverage Analysis And Plan in this same folder.

Scope of the audit: Supabase Postgres (54 tables, RLS, 26 plus RPCs, 8 storage buckets) and the Next.js data access layer (115 API routes, around 60 using the service role key). There are no Supabase Edge Functions, so the only security boundary is the Next.js route code plus Postgres RLS.

Every Critical and High finding below was confirmed directly against the live database or the source file, not inferred. File references use the path inside the app directory.

#### How To Read This Document

Items are grouped into three importance tiers, then a single consolidated checklist covering everything.

- Incredibly Important: exploitable data exposure or account compromise. These block launch. Most are reachable with nothing but the public anon key that ships in the browser.
- Medium Importance: real abuse, cost, or integrity risks, and the changes needed so the codebase stays safe as it grows.
- Low Importance: hardening and hygiene. Worth doing, not blocking.
- Everything: one master table of all items with an ID, area, severity, and a tick box.

Severity legend: C is Critical, H is High, M is Medium, L is Low.

#### Headline Verdict

The architecture and the foundations are good. The newest code, the Pro portal under api/pro, is built correctly with proper multi tenant isolation. The problem is inconsistency: older diagnosis and provider application routes query or mutate by a client supplied id through the service role key with no ownership check, and the database itself was left open in several places the app never intended to expose. The fixes are oversights to close, not a re architecture. Do not point launch marketing at the product until the Incredibly Important tier is complete.

---

## Incredibly Important

These must all be closed before launch. The fastest wins are the database grant and storage changes, which are minutes of work and need no application changes because the app calls those functions as the service role.

#### Database And Storage

- [ ] **C1. get_user_id_by_email is callable by anonymous users**
    - Where: Postgres function public.get_user_id_by_email, granted EXECUTE to anon and authenticated. Used by api/pro/members/route.ts line 113 via the service role client.
    - Risk: The body is SELECT id FROM auth.users WHERE lower(email) equals lower(p_email). Anyone with the public anon key can post an email and learn whether an account exists and get its user id. This is an account enumeration oracle and the first step of a personal data harvest chain with C2.
    - Fix: REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated. The service role call is unaffected.

- [ ] **C2. user_home_stats returns any user's diagnoses and home addresses**
    - Where: Postgres function public.user_home_stats(uuid), SECURITY DEFINER, granted to anon and authenticated.
    - Risk: It takes an arbitrary p_user_id and returns that user's diagnosis titles, customer_address, and recent diagnosis detail with no auth.uid check. Chained with C1 the path is email to user id to home address and problem history, for any user, using only the anon key. Confirmed against the live function body.
    - Fix: REVOKE EXECUTE from anon and authenticated, and rewrite it to derive identity internally with WHERE d.user_id equals auth.uid rather than taking the id as a parameter, or keep it service role only.

- [ ] **C3. All 8 storage buckets are public**
    - Where: storage.buckets. avatars, banners, diagnosis, gallery, message-attachments, reviews, showcase, vault all have public true, and none has a file_size_limit or allowed_mime_types.
    - Risk: Diagnosis photos, which the app pairs with addresses, contractor to customer message attachments, and whatever is in vault, are readable by anyone who has the object URL. Combined with C4 the URLs also leak.
    - Fix: Make diagnosis, gallery, message-attachments, and vault private and serve through short lived signed URLs. Set per bucket size and MIME limits as defence in depth.

- [ ] **H4. RLS is disabled on three public tables**
    - Where: ai_call_log, providers_backup_20260601, provider_cache_backup_20260601.
    - Risk: RLS off in a public schema means they are readable through PostgREST with the anon key. The backups are full copies of provider data. ai_call_log holds prompts and image URLs.
    - Fix: Enable RLS on ai_call_log. Drop the two backup tables, they are dead weight.

- [ ] **H2. run_data_layer_maintenance is callable by anonymous users and deletes data**
    - Where: Postgres function public.run_data_layer_maintenance, SECURITY DEFINER, anon EXECUTE. Called by the cron at api/cron/data-layer-maintenance/route.ts line 19 as the service role.
    - Risk: It deletes from provider_cache and diagnosis_usage. An anonymous caller can trigger it to wipe quota records, which resets everyone's diagnosis quota on demand.
    - Fix: REVOKE EXECUTE from anon and authenticated.

- [ ] **H6. Two SECURITY DEFINER views bypass RLS**
    - Where: diagnosis_outcomes and diagnosis_clarification_stats.
    - Risk: They run as the definer, so any grantee reads underlying rows ignoring RLS.
    - Fix: Recreate both as views with security_invoker set to true.

#### Application Routes

- [ ] **C4. IDOR, GET api/diagnoses/[id] leaks any user's address, GPS, and photos**
    - Where: src/app/api/diagnoses/[id]/route.ts lines 37 to 45.
    - Risk: It selects customer_lat, customer_lng, customer_address, image_urls, and diagnosis by id through the service role client with no ownership check. UUIDs travel in URLs and are not secrets, so anyone who has or guesses an id reads a stranger's home location and photos.
    - Fix: Resolve the session user with getUser or the anonymous cookie, and require that the row owner matches before returning, otherwise return 404.

- [ ] **C5. IDOR and ownership hijack, PATCH api/diagnoses/[id]**
    - Where: src/app/api/diagnoses/[id]/route.ts lines 90 to 234.
    - Risk: It updates any row by id through the service role, and user_id is a client settable field (PATCH_KEYS line 20, handling lines 111 to 114). An attacker can overwrite anyone's diagnosis and address, reassign a victim's diagnosis to their own account, orphan it with a null user_id, or plant rows at arbitrary ids since the handler inserts on no match.
    - Fix: Enforce ownership before update. Remove user_id from the client settable keys. On insert, force user_id to the session user.

- [ ] **C6. Unauthenticated personal data read and delete of provider applications**
    - Where: src/app/api/providers/application-progress/route.ts, and the same shape in application-session/route.ts.
    - Risk: GET does select star from provider_applications filtered only by a client supplied phone query parameter, or a spoofable x-forwarded-for. Passing a victim's phone returns their full application with name, email, address, and document paths. DELETE removes any application by client supplied id with no auth at all (line 46). The IP branch also does ilike on notes with the raw ip, a filter injection.
    - Fix: Gate both behind the existing edit token or an authenticated session bound to user_id. Never key personal data retrieval or deletion on a client supplied phone or id.

- [ ] **H1. Diagnosis storage is public and combines with the diagnosis IDOR**
    - Where: the diagnosis and gallery buckets from C3, plus C4.
    - Risk: Victim photos in the public buckets are permanently fetchable, and the IDOR GET hands out the URLs. Treat this as one chain, it is fully resolved by completing C3 and C4.
    - Fix: Covered by C3 and C4. Verify after those land that image URLs are only ever issued as signed URLs to the owner.

- [ ] **H3. Diagnosis quota can be bypassed and tampered with**
    - Where: increment_diagnosis_quota (anon executable), and api/diagnose/quota.ts line 91.
    - Risk: The anonymous quota key is the client's own scandio_anon cookie, so rotating or dropping the cookie resets the three per week cap. The first message check trusts client supplied history, so sending a dummy history entry skips the increment entirely. Also, being anon executable, the function lets anyone inflate another user's count to deny them service. The net effect is that the paywall on the paid Gemini call is cosmetic against any scripted caller.
    - Fix: REVOKE EXECUTE from anon and authenticated. Key the anon quota on a signed cookie or on IP rather than a client chosen opaque value. Decide first message server side from the conversation id, not from client history.

- [ ] **H5. Unauthenticated writes to arbitrary providers**
    - Where: api/providers/[id]/gallery, api/providers/[id]/sync-google-gallery, api/providers/clean-profile, and api/providers/restore-token.
    - Risk: All run through the service role with no ownership check, so anyone can attach images to any provider, trigger a paid Google fetch for any id, mutate any provider's copy, and credit rotation tokens or insert provider_contact_events for any provider.
    - Fix: Bind each write to the authenticated owner using the approved application to matched_provider_id pattern already used correctly in api/contractors/account.

---

## Medium Importance

These are real abuse, cost, and integrity risks, plus the structural changes that keep the codebase safe as it grows.

#### Abuse And Cost

- [ ] **M1. WhatsApp simulator is a public unauthenticated bot driver**
    - Where: src/app/api/whatsapp/simulator/route.ts line 28.
    - Risk: It runs the real handleMessage, lets a caller impersonate any from phone and read back that phone's session, and burns Gemini quota.
    - Fix: Gate it off in production behind an environment flag, or require auth.

- [ ] **M2. Open paid API proxies bypass the beta gate**
    - Where: api/geocode, api/directions, api/providers/onboarding/place-details, api/providers/onboarding/search, exempted in proxy.ts.
    - Risk: Unauthenticated, protected only by per IP rate limits on the Google billing keys.
    - Fix: Add a global daily spend circuit breaker, and require at least a session where the WhatsApp exemption is not needed.

- [ ] **M3. Rate limiting degrades silently to per lambda memory if Upstash env is missing**
    - Where: src/lib/rate-limit.ts line 144.
    - Risk: On Vercel a missing Upstash config means effectively no limit, and it fails open with no signal.
    - Fix: Make Upstash mandatory and fail closed in production for the cost bearing buckets.

- [ ] **M4. Kill switches are not gated to non production**
    - Where: DISABLE_RATE_LIMIT and DISABLE_DIAGNOSIS_DAILY_QUOTA.
    - Risk: Either one disables protections globally with no NODE_ENV guard, so one stray environment value turns everything off.
    - Fix: Honour them only when NODE_ENV is not production, and log loudly when active.

#### Authorization And Integrity

- [ ] **M5. Legacy admin login has no brute force limit and a non constant time compare**
    - Where: src/app/api/admin/login/route.ts line 12, submitted not equal expected.
    - Risk: The real admin gate is now profiles.is_admin, so this whole ADMIN_PASSWORD HMAC cookie path appears dead.
    - Fix: Delete the legacy path entirely, createAdminSession, verifyAdminToken, setAdminCookie, and this route.

- [ ] **M6. Admin email routes trust client supplied recipients**
    - Where: api/admin/send-email, send-reply, send-outreach.
    - Risk: Admin gated so not an open relay, but a CSRF or XSS on the admin UI becomes an arbitrary send primitive.
    - Fix: Derive the recipient server side from the referenced providerId or messageId. Add a basic email format check on outreach targets.

- [ ] **M7. PostgREST filter string injection**
    - Where: api/providers/search/route.ts line 58, and api/pro/members/route.ts line 121.
    - Risk: Raw user input or email interpolated into an or filter string. Bounded today by input shape, fragile if validation loosens.
    - Fix: Escape wildcards and avoid string built or filters. Copy the escaping already done in api/providers/onboarding/search.

- [ ] **M8. audit_logs INSERT policy is always true**
    - Where: RLS policy on public.audit_logs.
    - Risk: Anyone can forge audit entries, undermining the trail. The contact_messages and provider_applications anon insert policies are also always true, which is acceptable for public forms but should keep server side validation and the existing rate limits.
    - Fix: Restrict the audit_logs insert policy so entries cannot be forged by clients.

- [ ] **M9. Nine functions have a mutable search_path**
    - Where: increment_diagnosis_quota, recompute_mendr_rating, set_primary_trade, next_invoice_seq, and others listed by the linter.
    - Risk: For SECURITY DEFINER functions a mutable search_path is a privilege escalation vector.
    - Fix: Add SET search_path to an empty string, or to pg_catalog and public, on each function.

- [ ] **M10. Leaked password protection is disabled**
    - Where: Supabase Auth settings.
    - Risk: Compromised passwords from known breaches are accepted.
    - Fix: Enable the HaveIBeenPwned check in the dashboard.

- [ ] **M11. Password change rotates the session as a side effect**
    - Where: src/app/api/account/password/route.ts line 49.
    - Risk: It verifies the old password with signInWithPassword on the cookie bound client, which mutates auth cookies and can leave an inconsistent state on partial failure.
    - Fix: Verify on a throwaway client with persistSession false, then update on the real session client.

#### Maintainability And Scale

- [ ] **M12. No shared authenticate and authorize helper**
    - Risk: With 115 routes each one re implements identity and ownership checks by hand, which is the direct cause of C4, C5, C6, and H5. Around 60 routes use the service role client, and every one is a place RLS is bypassed and authorization must be hand written.
    - Fix: Introduce withAuth, withProvider, and withOwnedDiagnosis wrappers that resolve identity and ownership once, and per route zod schemas. Prefer the user scoped client with RLS where possible.

- [ ] **M13. Validation is hand rolled and inconsistent**
    - Risk: zod is a dependency but barely used in routes, so checks drift between routes.
    - Fix: Adopt a zod schema per route as the single validation layer.

- [ ] **M14. Unindexed foreign keys and per row auth in RLS**
    - Risk: The performance advisor reports 29 auth_rls_initplan warnings, where RLS policies re evaluate auth.uid per row, and 24 unindexed foreign keys. These do not bite at the current volume but will hurt the Pro portal first as jobs, quotes, and invoices grow.
    - Fix: Wrap auth.uid as a scalar subquery in policies, and add indexes on the foreign keys flagged by the advisor.

---

## Low Importance

Hardening and hygiene. Worth doing, not blocking.

- [ ] **L1. pg_trgm extension lives in the public schema.** Move it to an extensions schema.
- [ ] **L2. beta-access master code is compared in non constant time** with a per IP throttle only. Use a constant time compare and a per code attempt cap.
- [ ] **L3. Anonymous analytics writes accept a client supplied session_id** in api/providers/[id]/view and api/events, allowing metric inflation. Relevant given the published stat guardrails.
- [ ] **L4. Stale ADMIN_PASSWORD comments** appear in many route headers although the value is unused. Remove them.
- [ ] **L5. cron-auth and some token checks use a plain equals** rather than a constant time compare. Negligible over the network, easy to harden.
- [ ] **L6. Two Supabase MCP servers are connected** and one returns no projects. Prune to one to keep tooling unambiguous.
- [ ] **L7. Remove dead code** once the above land, the legacy admin login path, the two backup tables, and the stale environment comments.
- [ ] **L8. Two tables have no primary key, plus 36 unused and 4 duplicate indexes** per the performance advisor. Clean these up during the index pass in M14.

---

## Everything

One consolidated checklist of every item, in fix order. Recommended sequence: database grants and storage first, then the diagnosis routes, then the provider application routes, then the remaining hardening, then the refactor.

| ID | Severity | Area | Item | Done |
| --- | --- | --- | --- | --- |
| C1 | C | Database | Revoke anon execute on get_user_id_by_email | [ ] |
| C2 | C | Database | Revoke and rewrite user_home_stats to use auth.uid | [ ] |
| C3 | C | Storage | Make diagnosis, gallery, message-attachments, vault private with signed URLs | [ ] |
| C4 | C | Route | Ownership check on GET api/diagnoses/[id] | [ ] |
| C5 | C | Route | Ownership check on PATCH api/diagnoses/[id], drop client user_id | [ ] |
| C6 | C | Route | Auth gate read and delete on application-progress and application-session | [ ] |
| H1 | H | Storage | Verify diagnosis image URLs only issued signed to owner | [ ] |
| H2 | H | Database | Revoke anon execute on run_data_layer_maintenance | [ ] |
| H3 | H | Quota | Revoke increment_diagnosis_quota, fix anon key and first message logic | [ ] |
| H4 | H | Database | Enable RLS on ai_call_log, drop the two backup tables | [ ] |
| H5 | H | Route | Ownership checks on provider gallery, sync, clean-profile, restore-token | [ ] |
| H6 | H | Database | Recreate the two SECURITY DEFINER views as security_invoker | [ ] |
| M1 | M | Abuse | Gate the WhatsApp simulator off in production | [ ] |
| M2 | M | Cost | Global spend circuit breaker on the Google proxies | [ ] |
| M3 | M | Cost | Make Upstash mandatory and fail closed in production | [ ] |
| M4 | M | Config | Gate the kill switches to non production | [ ] |
| M5 | M | Auth | Delete the legacy admin login path | [ ] |
| M6 | M | Auth | Derive admin email recipients server side | [ ] |
| M7 | M | Injection | Escape PostgREST or filters in search and members | [ ] |
| M8 | M | Integrity | Restrict the audit_logs insert policy | [ ] |
| M9 | M | Database | Set search_path on the nine flagged functions | [ ] |
| M10 | M | Auth | Enable leaked password protection | [ ] |
| M11 | M | Auth | Verify old password on a throwaway client | [ ] |
| M12 | M | Maintainability | Shared withAuth and ownership wrappers | [ ] |
| M13 | M | Maintainability | zod schema per route | [ ] |
| M14 | M | Performance | Index foreign keys, wrap auth.uid in RLS as subquery | [ ] |
| L1 | L | Database | Move pg_trgm out of public schema | [ ] |
| L2 | L | Auth | Constant time beta code compare and per code cap | [ ] |
| L3 | L | Integrity | Server bind analytics session id | [ ] |
| L4 | L | Hygiene | Remove stale ADMIN_PASSWORD comments | [ ] |
| L5 | L | Auth | Constant time cron and token compares | [ ] |
| L6 | L | Tooling | Prune to a single Supabase MCP server | [ ] |
| L7 | L | Hygiene | Remove dead code and backup tables | [ ] |
| L8 | L | Performance | Add missing primary keys, drop unused and duplicate indexes | [ ] |

#### Positive Controls To Keep

These are already correct and should be the template for the rest of the codebase. Per account admin via validated JWT and profiles.is_admin. requireAdmin applied on all 21 admin routes across every method. 32 byte hashed one time expiring edit tokens for contractor applications. HMAC unsubscribe tokens with a constant time compare. Magic byte upload validation. The entire api/pro portal enforces provider_id tenancy on every id route. The api/account routes are correctly self scoped including delete and export. Migrations are clean and well named.
