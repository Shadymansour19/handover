# Handover — Project Spec & Decisions

Migrating an industrial work-permit / equipment-tracking tool from Google Apps
Script to Supabase + a static PWA. This file is the durable source of truth —
read this before re-deriving requirements from scratch in a future session.

## Tech stack

- **Frontend**: Vanilla JS + Vite, built as a PWA (installable on Android/iOS,
  app-shell cached for offline launch — see "Offline scope" below).
- **Backend**: Supabase (Postgres + Auth + RLS).
- **Auth**: Supabase Auth, email + password (see 2026-08-29 decisions below
  — this superseded the original magic-link plan), restricted to accounts
  the admin creates directly (no public sign-up).
- **Export**: Client-side `.docx` generation via the `docx` npm library, plus
  client-side `.pdf` generation via `pdfmake` (added 2026-08-30 — see
  "Decision (2026-08-30) — .pdf export added" below; originally spec'd as
  "no PDF").
- **Hosting**: static site on Vercel or Netlify (free tier).
- **Admin user management**: a Supabase Edge Function
  (`supabase/functions/admin-manage-users/`), used only for the two things
  that genuinely require the `service_role` key (creating an account,
  setting someone else's password) — see "2026-08-30 — user management"
  below. Deployed separately from migrations (`supabase functions deploy`),
  not via the GitHub integration.

## Decisions made (2026-08-30) — user management

| Question | Decision | Why / implication |
| --- | --- | --- |
| How does an admin create a new account in-app (instead of the dashboard)? | **Edge Function `admin-manage-users`, action `create`** | Creating an `auth.users` row requires the Admin API (`auth.admin.createUser`), which needs `service_role` — never usable from the browser. The function verifies the caller is authenticated and `is_admin()` (via their own session) before touching `service_role`, which is only ever held inside the function's own runtime. |
| How does an admin edit someone's role/username/active status? | **Plain client-side `UPDATE` on `profiles`, RLS-governed** | Unlike account creation, this doesn't need `service_role` — added a `profiles_update` policy (`using (is_admin()) with check (is_admin())`, `20260830100000_admin_manage_users.sql`). `profiles` had **no** update policy at all before this; role/username changes were SQL-editor-only until now. |
| How does an admin see users' email addresses? | **`list_users()` SECURITY DEFINER RPC** | Email lives in `auth.users`, which RLS can't reach (Supabase-managed schema, not ours). The function joins `auth.users` + `profiles` and checks `is_admin()` itself — a non-admin gets an empty result, not an error (a read, so silent-empty is fine; contrast with the Edge Function's writes, which raise real errors for a non-admin). |
| How does an admin set someone ELSE's password? | **Edge Function, action `set-password`** | Same `service_role` requirement as account creation (`auth.admin.updateUserById`). |
| Can an admin delete a user account? | **Yes — hard delete, with optional reassignment, Edge Function action `delete`** | Same `service_role` requirement (`auth.admin.deleteUser`). `profiles.id` cascades on delete, but `maintenance_records`/`operation_events`'s `created_by`/`updated_by` do **not** (plain `REFERENCES`, no `ON DELETE` clause) — deleting a user who has ever created/edited a record fails with a foreign-key error, rather than silently orphaning/erasing their audit trail. The "Delete User" modal offers reassigning that user's records to a different, still-existing user first (updates all four columns across both tables via `service_role`, bypassing RLS since it must touch rows the deleting admin doesn't own), then deletes — or the admin can decline reassignment and let it fail, and deactivate (`is_active = false`) instead. Blocked for deleting your own account, same self-lockout reasoning as demote/deactivate. |
| How does a user change their OWN password? | **Direct client call, no Edge Function** | `supabase.auth.updateUser({ password })` works with the caller's own session — no `service_role` needed for your own account. Re-verifies the current password first via a fresh `signInWithPassword` call (Supabase's `updateUser` doesn't require this on its own, which would otherwise let anyone with a hijacked/unlocked session change the password without knowing it, locking the real owner out). |
| Can an admin deactivate/demote themselves via the UI? | **No — blocked client-side** | Confirmed by direct testing: deactivating your own profile instantly loses you `is_allowed_user()`/`is_admin()` (both check the *caller's own* profile), locking you out of every table immediately, no error, no undo except another admin (or direct DB access) reactivating you. Correct behavior for deactivating *someone else*, a nasty footgun on yourself. The "Manage Users" edit form disables the role/active controls on the signed-in admin's own row. **Not enforced server-side** — a big enough gap to note, small enough (single-admin internal tool) not to fix with an RLS/trigger guard right now. |

## Decisions made (2026-08-27)

| Question | Decision | Why / implication |
| --- | --- | --- |
| Frontend framework | **Vanilla JS + Vite** | No framework lock-in, smallest bundle, simplest PWA setup. Use `vite-plugin-pwa` for manifest + service worker instead of hand-rolling. |
| Offline scope | **App-shell caching only** | Service worker caches static assets so the app *launches* offline and shows last-loaded data. Reads/writes require connectivity. No IndexedDB write queue, no sync/conflict logic. |
| Edit/delete permissions | **Own records only** | RLS restricts UPDATE to rows where `created_by = auth.uid()`. Real DELETE is disabled entirely in favor of soft delete (see below), and the soft-delete "delete" action is implemented as an UPDATE, so the same own-records-only rule applies to it. **Known limitation**: one user cannot fix another user's mistake in the UI. If that becomes a problem, add an admin-override path later (e.g. a `security definer` RPC) rather than loosening RLS broadly. |
| Delete behavior | **Soft delete, 30-day retention** | Rows get `deleted_at` set instead of being removed. Hidden from regular-user reads via RLS SELECT policy (`deleted_at IS NULL`); an admin can see and restore a deleted row via the UI (see 2026-08-30 addition below). After 30 days, a daily `pg_cron` job (`20260830070000_purge_deleted_after_30_days.sql`) permanently deletes it — no restore possible past that point. Real client-side `DELETE` is still never granted; only this scheduled job and the admin restore RPC can change `deleted_at`. |

## Postgres/RLS gotcha found in Phase 2 (2026-08-29) — soft delete needs an RPC

Soft-deleting via a plain client-side `UPDATE ... SET deleted_at = now()`
**always fails RLS**, for every user including admins, with `new row
violates row-level security policy`. This has nothing to do with
ownership/admin logic (which was correct) — it's a genuine, documented
Postgres behavior: **for UPDATE, Postgres implicitly re-checks the table's
SELECT policy against the resulting row, in addition to the UPDATE
policy's own `WITH CHECK`, whether or not `RETURNING`/`.select()` is
used.** Our SELECT policy is `deleted_at IS NULL` — so any update that
moves `deleted_at` away from `NULL` fails that implicit check immediately,
independent of the UPDATE policy passing. No ownership/RLS-policy tweak can
fix this; confirmed empirically (temporarily loosening just the SELECT
policy made the identical update succeed) before concluding it wasn't a
deployment/migration-timing issue.

**Fix**: soft delete goes through a `SECURITY DEFINER` RPC
(`soft_delete_maintenance_record` / `soft_delete_operation_event`,
`20260830050000_soft_delete_rpc.sql`) instead of a direct client UPDATE.
The function bypasses RLS internally (runs as its owner) and does its own
manual authorization check (same own-record-or-admin rule) before writing.
`operation_events` was given the identical fix pre-emptively, since it has
the same `deleted_at`-based SELECT policy shape and would hit this exact
bug the moment Phase 3 adds delete there — worth remembering if any other
table ever needs "write a row into a state that its own SELECT policy
would hide" (this one bit us on first contact and will bite again on any
new table shaped the same way).

## Decisions made (2026-08-30) — admin restore + purge retention

| Question | Decision | Why / implication |
| --- | --- | --- |
| Can admin see/undo a deleted record? | **Yes** | `maintenance_records_select` RLS now allows `deleted_at IS NOT NULL` rows through for `is_admin()`; a `restore_maintenance_record` RPC (same SECURITY DEFINER pattern as delete) clears `deleted_at`. Regular users still can't see deleted rows at all — this is an RLS-level guarantee, not a UI-only hide. `operation_events` was deliberately left out of this one initially (it had no delete UI at the time) — given the same treatment once Phase 3's History modal existed to expose it: `operation_events_select`, `restore_operation_event`, `hard_delete_operation_event` (`20260830090000_admin_view_restore_operation_events.sql`), with a "Show deleted" toggle in the History modal mirroring the main table's. |
| How long do soft-deleted records live before permanent removal? | **30 days**, or immediately if an admin chooses to | A daily `pg_cron` job (`purge_soft_deleted_records`, `20260830070000_purge_deleted_after_30_days.sql`) hard-deletes any row with `deleted_at` older than 30 days, for both `maintenance_records` and `operation_events`. Tested against controlled data before relying on it (a 31-day-old deleted row was purged; a 5-day-old one and a never-deleted one both survived). An admin can also permanently delete a soft-deleted record on demand, via `hard_delete_maintenance_record` (`20260830080000_admin_hard_delete.sql`) — same SECURITY DEFINER pattern, only callable on a record that's already soft-deleted (guards against skipping the soft-delete step). Either way, past that point a record is gone for good — no admin restore, no direct-DB recovery. |

## Decision (2026-08-30) — `docx` is lazy-loaded, not a top-level import

The `docx` library is large (~350KB) and only needed once someone actually
clicks Export. `mainView.js`'s Export handler loads it via a dynamic
`import('../lib/docxExport.js')` instead of a static top-level import —
confirmed via build output that this keeps it out of the main bundle
(~253KB, matching pre-`docx` size) as a separate chunk that only loads on
demand. The generated document itself was verified directly (not just "the
build doesn't error"): a real test document was produced from
representative data and its XML content inspected, confirming dd-mm-yyyy
formatting, correct chronological ordering, a Swap event appearing under
both equipment with the right direction ("→"/"←"), the Running tag, and an
empty system being omitted entirely — all before ever asking anyone to
open it in an actual Word viewer.

## Decision (2026-08-30) — `.pdf` export added (reverses "no PDF")

A second export format was requested: `.pdf`, generated client-side via
`pdfmake` (a plain-JS library with a bundled font set — no native/WASM
dependency, so it stays fully offline-capable once loaded), exposed as a
fourth FAB alongside Export (docx)/Filter/Add Record. `lib/pdfExport.js`
deliberately mirrors `lib/docxExport.js`'s content and omission rules
exactly (same System banner → Equipment header → chronological table,
same `hide_when_empty`/Generic-equipment rules, same Swap-on-both-units) —
only the rendering API differs — so the two formats can't drift apart.
Verified directly (not just "the build doesn't error"): generated a real
PDF from representative data via pdfmake's Node API and confirmed with
`pdftotext` that the text content, table structure, and bullets all came
through correctly, before ever wiring it into the UI.

One accepted gap versus the `.docx` export: pdfmake has no equivalent of
`keepNext`/`tableHeader`'s page-break protections (an equipment header
orphaned alone at the bottom of a page, or a table header separated from
its first data row) — not chased further for this first pass; revisit if
it's actually seen happening on a real multi-page export.

Also: `lib/downloadBlob.js` was split out of `docxExport.js` (which
previously defined and exported it) into its own zero-dependency file, so
that both `docxExport.js` and the new `pdfExport.js` can use it without
statically importing (and thus bundling) each other's export library —
each stays an independently lazy-loaded chunk. `vite.config.js`'s
`workbox.globPatterns` also picked up a `globIgnores` for both export
chunks (docx included, not just the new pdfmake one): pdfmake plus its
bundled font set is ~1.7MB, and neither export library needs to be
precached for offline use — exporting already requires a live Supabase
fetch of fresh data regardless of what the service worker has cached.

## Decision (2026-08-30) — main view toolbar redesign: FAB cluster + hamburger menu

Add Record / Filter / Export used to sit as always-visible buttons in an
inline toolbar row; Sign Out / Change Password / Manage Users sat as
separate buttons in the header. Both revised to be hidden by default:

- Add Record, Filter, Export now live behind a single circular
  floating-action-button (FAB) fixed to the bottom-right of the page,
  showing a dots icon; clicking it expands/collapses three sub-FABs (one
  per action), each with an icon + `title` hint. Reuses the existing
  `[hidden]`-gated show/hide + outside-click-to-close mechanics the
  row-menu (⋮) dropdown already used, generalized into one `setupToggle()`
  helper in `mainView.js` shared with the header menu below.
- Filtering (date range + admin-only "show deleted") moved out of the
  inline form into a dialog (`views/filterModal.js`), opened from the
  Filter FAB.
- Sign Out / Change Password / Manage Users moved into a dropdown behind a
  hamburger (☰) button in the header, using the same toggle mechanism.

## Decisions made (2026-08-29) — auth pivot

The magic-link plan above was replaced before any real users were onboarded
(nobody had been invited yet). Reason: the ~10 users are facility workers
sharing devices/terminals, not each reliably checking their own email inbox
for a link — handing out an email + password they can type is more workable
day to day than a magic-link flow.

| Question | Decision | Why / implication |
| --- | --- | --- |
| Sign-in method | **Supabase Auth, email + password** (not magic link) | Login is by **email**, not a separate username — `username` is a display-only field (see `profiles` below). Still 100% Supabase Auth under the hood, so RLS's `auth.uid()`/`auth.jwt()` keep working unchanged; no custom password storage was built (that would be a real security problem and would break every existing RLS policy, which depend on a real Supabase Auth session). |
| Account creation | **Admin creates every account directly** | No public/self-serve sign-up (kept disabled in Auth settings). Admin uses Supabase Dashboard → Authentication → Users → "Add user" (sets email + password there), then sets that user's `username`/`role` in the new `profiles` table. No in-app "create user" UI in Phase 1 — see PLAN.md if that's wanted later (would need a `service_role`-backed Edge Function, since the admin API key can never ship to the browser). |
| Roles | **`profiles.role`: `'user'` or `'admin'`, admin has real extra power now** | One `public.profiles` row per `auth.users` row (`username`, `role`, `is_active`), auto-created by a trigger on `auth.users` insert (default `role = 'user'`) so the admin only has to flip the one real admin account's role afterward. Admin can edit/delete **any** record, not just their own — RLS on `maintenance_records`/`operation_events` UPDATE now allows `created_by = auth.uid() OR is_admin()`. Regular users keep the existing own-records-only rule. |
| Allowlist mechanism | **Replaced by `profiles` row existence** | The original `allowed_users` email table is dropped — with public sign-up disabled and every account admin-created, an existing `auth.users` row *is* the allowlist. `is_allowed_user()` now checks for an active `profiles` row (`profiles.is_active`) instead of an email list; kept as the same function name so no other RLS policy had to change. `is_active` also gives a cheap way to revoke a departed worker's access later without deleting their auth account. |

## Other assumptions (not asked, low-risk defaults — revisit if wrong)

- **Timezone**: no facility timezone specified. `start_date`/`end_date` are
  plain `date` columns (no timezone ambiguity). `operation_events.timestamp`
  and default "last 7 days" filter use the browser's local time. Revisit if
  the facility needs a fixed timezone regardless of the viewer's device.
- **Multi-line fields** (`detailed_steps`, `comment`): stored as plain text
  with `\n`-separated lines; each non-empty line renders as one bullet in the
  View modal and in the `.docx` export. No markdown, no rich text.
- **`last_updated`** (spec) is implemented as the `updated_at` column
  (auto-maintained by trigger) — not a separate duplicate column.
- **Reference data (systems/equipment) as tables, not enums**: `work_status`
  and `action` are true fixed vocabularies → Postgres enums. `systems` and
  `equipment` are more like configuration data the facility might extend
  (new generator installed, etc.) and Postgres enum types are awkward to
  alter (`ALTER TYPE ... ADD VALUE` can't run inside the same transaction as
  other DDL) — so these are normal lookup tables with a `sort_order` column
  instead. This also lets `systems` carry per-system flags
  (`operation_tracked`, `hide_when_empty`) instead of hardcoding system names
  in application logic.
- **Allowlist enforcement (superseded 2026-08-29, see decisions above)**: now
  two-layered — disable public sign-up in Auth settings (so nobody can
  self-register even by calling the client SDK directly), plus
  `is_allowed_user()` checking `profiles.is_active` — checked in every RLS
  policy, same as before, just backed by `profiles` instead of an email list.
- **Business rules enforced at the DB layer (not just client-side)**:
  - `end_date` auto-fill/lock for `maintenance_records` (see the migration
    trigger) — enforced server-side so a buggy client can't violate it.
  - Derived equipment run/stop status is a SQL **view**
    (`equipment_status`), not a stored column — computed from event history
    per the spec. The Run/Stop/Trip/Swap *validation* rules ("reject Run if
    already Running", etc.) are left to the **application layer** for Phase
    1–3, reading from this view before insert. Consider hardening with a
    DB trigger later if the app layer proves insufficient (e.g. once a
    second client is added).

## Data model (as specified)

### Systems (fixed order)

1. PHVII GTG — equipment: GT-8040, GT-8050, GT-8060, Generic
2. Main Compressor — equipment: GT-1710A, GT-1710B, GT-1710C, GT-1710D, GT-1710E, Generic
3. Booster Compressor — equipment: GT-1050A, GT-1050B, Generic
4. Scarab GTG — equipment: GT-8000, GT-8010, GT-8030, Generic
5. Workshop — equipment: Generic
6. Others — equipment: Generic

Operation tracking applies **only** to PHVII GTG, Main Compressor, Booster
Compressor (and never to their "Generic" equipment entry).

Workshop / Others / Scarab GTG are the three systems that **hide entirely**
when they have zero records in view/export (all other systems always show
every equipment row, even with zero records).

### Table 1: `maintenance_records`

- id (uuid), start_date, end_date (nullable), system, equipment,
  work_scope (text), detailed_steps (text, multi-line/bulleted),
  work_status (enum), comment (text, multi-line), last_updated
- `work_status` options: Permit Prepared, Permit Submitted, Permit Discussed,
  Permit Ready to Open, Work in Progress, Work is Done, Job Canceled, Job
  Held, Other (free text)
- `end_date` auto-fills to today when status becomes one of the 3 terminal
  statuses (Work is Done / Job Canceled / Job Held), stays user-editable
  after that, but is locked/empty while status is non-terminal.

### Table 2: `operation_events`

- id (uuid), timestamp (user-editable, defaults to now), action, system,
  equipment, secondary_equipment (nullable), comment
- actions: Run, Stop, Trip, Run Test, Spin/Crank, Swap
- Status is **derived**, not stored: most recent Run→Running,
  Stop/Trip→Stopped, Swap→primary becomes Stopped + secondary becomes
  Running. Run Test / Spin / Crank are transient — they don't change
  persisted status.
- Validation: Run/Run Test/Spin/Crank rejected if equipment already Running.
  Stop/Trip rejected if already Stopped. Swap requires primary currently
  Running and secondary currently Stopped.
- All units start "Stopped" with no events.

## Frontend features (full scope, later phases)

- Main view: grouped System → Equipment, table of maintenance records per
  equipment (Start date, Scope, Status, Actions: View/Edit/Delete). Equipment
  always shown even with zero records, **except** Workshop/Others/Scarab GTG
  (hide entirely when empty).
- Tracked equipment shows "(Running)" in green when running.
- "History" button next to tracked equipment → modal listing all operation
  events for that unit, with Edit/Delete per event.
- "+ New Record" modal, Maintenance/Operation tab toggle:
  - Maintenance tab: full form as above.
  - Operation tab: Action → Timestamp → System → Equipment (filtered to
    valid units per the action's required state) → Secondary Equipment
    (only for Swap, filtered to Stopped units) → Comment.
- Date range filter (From/To, default last 7 days). Maintenance record shows
  if its date range overlaps the filter interval; operation events show if
  their date falls in range. **Revised 2026-08-30**: operation events are
  **not** shown in the main view's table at all (an attempt to add them
  there, combined chronologically with maintenance records, was built and
  then explicitly reverted) — they're viewed via the "History" button only.
  The date-range-filtered combined view this bullet describes still applies
  to the `.docx` export below, which is why `lib/combinedTimeline.js` (the
  merge logic built for the reverted attempt) was kept rather than deleted.
- Multi-line fields render as bullet lists in View modal.
- Export button: `.docx` for current filtered range — System banner (styled)
  → Equipment sub-header (styled, shows Running status) → combined
  chronological table of maintenance records + operation events, Swap events
  appear under **both** equipment involved. **Revised 2026-08-30**: omission
  ended up matching the main view's `hide_when_empty` rule (only
  Workshop/Others/Scarab GTG omit when empty — not literally every system,
  as first built and then corrected) plus one export-only addition: every
  system's "Generic" catch-all equipment is omitted when it has no
  activity, tracked system or not.
- Auth: email + password login (originally spec'd as magic link — see
  "2026-08-29 — auth pivot" above), admin-created accounts only, enforced
  via RLS.

## Companion docs

- [supabase/migrations/](supabase/migrations/) — Postgres schema + RLS
  policies (deployed via Supabase's GitHub integration).
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — frontend folder layout.
- [PLAN.md](PLAN.md) — phased build plan, Phase 1 = minimal slice (auth +
  read-only display grouped by system/equipment).

Phase 1 (auth + read-only display) is implemented — see PLAN.md for current
status. This file stays the durable source of truth for requirements and
decisions regardless of implementation progress, so future sessions don't
need to re-ask the same questions.
