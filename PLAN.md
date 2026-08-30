# Handover — phased build plan

Full feature scope is in [SPEC.md](SPEC.md). Building it in one pass isn't
the goal — each phase should be a working, reviewable increment.

**Status (2026-08-30): all phases below are done**, verified end-to-end by
the user against the real, deployed app (including Phase 6's mobile/PWA
checks). Further work is no longer tracked as phases — it's ad hoc
refinements and new features on top of the shipped app, logged as dated
decisions in [SPEC.md](SPEC.md) as they happen, same as several
mid-phase revisions already were (e.g. the Phase 4 combined-table revert,
the docx column-width fixes).

## Phase 0 — Planning (done)

- [SPEC.md](SPEC.md), [supabase/migrations/](supabase/migrations/),
  [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md), this file.

## Phase 1 — Minimal slice: auth + read-only display

Goal: prove the auth/RLS/data path end to end before any write logic exists.

- [x] Vite scaffold + `vite-plugin-pwa` (manifest, generateSW, placeholder
      icons). `npm install` / `npm run build` both verified working.
- [x] `auth.js`: email + password sign-in (`signInWithPassword`), session
      listener, sign-out. Switched from the original magic-link plan on
      2026-08-29 — see SPEC.md "auth pivot" — before any real users existed,
      so no migration/user-facing breakage from the switch.
- [x] `mainView.js`: shows the signed-in user's `username` + role (from the
      new `profiles` table), fetches `systems` + `equipment` (ordered),
      fetches `maintenance_records` for a "last 7 days" default (adjustable)
      range, groups by System → Equipment, renders a read-only table
      (View/Edit/Delete buttons present but disabled — Phase 2).
      Hide-when-empty rule applied for Workshop/Others/Scarab GTG.
- [x] No writes, no operation events, no export yet — matches scope.
- [x] Supabase project created (ref `pfkpvkaybylrdnfwycxn`), GitHub repo
      linked via Supabase's GitHub integration (working directory `.`).
      Schema restructured into `supabase/migrations/` + `supabase/config.toml`
      so it deploys automatically on push instead of manual SQL-editor paste.
- [x] Initial migration applied successfully (ran manually in the SQL
      editor once the project's "read-only transaction" provisioning issue
      cleared). The migration was then patched to guard every `create
      policy` with a matching `drop policy if exists`, so it's safely
      re-runnable if Supabase's GitHub integration deploys it again without
      knowing it was already applied out of band — nothing has been pushed
      to GitHub yet, so this was fixed before the pipeline's first run.
- [x] `profiles` + `role`/`is_active` + admin RLS override added in a new
      migration (`20260830000000_profiles_and_roles.sql`), replacing the
      unused `allowed_users` table (it was dropped — never populated).
- [x] `equipment_status`/`equipment_status_events` views fixed to
      `security_invoker = true` (`20260830010000_fix_view_rls_bypass.sql`)
      — they were bypassing RLS entirely before this, flagged by Supabase's
      own "Unrestricted" linter tag. Caught before Phase 3 puts real data
      through `operation_events`.
- [x] `profiles.full_name` + username-or-email login
      (`lookup_email_by_username` RPC) added
      (`20260830030000_add_profile_full_name.sql`,
      `20260830040000_login_by_username.sql`).
- [x] Admin account created and verified end-to-end: logs in with username
      `shady`, main view shows `shady (admin)`.

**Exit criteria — met**: the admin can log in with username + password and
see live maintenance records grouped correctly, header shows the
"(admin)" tag; nobody without an admin-created account can sign in at all
(no self-serve path exists). Only the ~10 normal users' accounts remain to
be created when there are real workers ready to use it — not blocking
further development.

## Phase 2 — Maintenance CRUD

- [x] "+ New Record" button/modal (Maintenance only — the Operation tab
      moved to Phase 3, once operation-event tracking exists to back it).
- [x] View modal: read-only, `detailed_steps`/`comment` rendered as bullet
      lists (`lib/bullets.js`).
- [x] Edit: reuses the same form modal pre-filled. Permission-gated in the
      UI (own records, or any record if admin — mirrors the RLS policy) by
      disabling the Edit/Delete buttons rather than letting the request
      fail; RLS is still the actual enforcement, not the disabled attribute.
- [x] `end_date` auto-fill/lock mirrored client-side in the form for instant
      feedback — the DB trigger remains the real enforcement.
- [x] Delete = soft delete, via a `SECURITY DEFINER` RPC
      (`soft_delete_maintenance_record`), not a plain client UPDATE — see
      SPEC.md "Postgres/RLS gotcha found in Phase 2" for why a direct
      UPDATE setting `deleted_at` always fails RLS regardless of
      ownership/admin logic, for every user, and needs this pattern.
- [x] Admin can see soft-deleted records ("Show deleted" toggle) and
      restore one (`restore_maintenance_record` RPC, same pattern).
      Regular users still can't see deleted records at all — RLS enforced,
      not just hidden in the UI.
- [x] Manually verified end-to-end against live data: create, edit, delete,
      view, and admin restore all confirmed working in the real app.

**Exit criteria — met**: create a record, see it appear grouped correctly;
edit it and see the change persist; soft-delete it and see it disappear
from the list; a non-owner, non-admin account can't edit/delete it (buttons
disabled) while the admin can; the admin can view and restore a deleted
record via "Show deleted".

## Phase 3 — Operation tracking

Needed almost no new SQL — the `operation_events` table, its RLS, the
`equipment_status` view, and `soft_delete_operation_event` were all already
built (and tested) in Phase 1. This phase was near-entirely frontend.

- [x] Operation tab in "+ New Record" (`newRecordModal.js` tab-switches
      between `recordModal.js`'s and `operationEventModal.js`'s forms):
      Action → Timestamp → System (tracked systems only) → Equipment
      (auto-filtered by `equipment_status` per the action's required
      state) → Secondary Equipment (Swap only, filtered to Stopped units)
      → Comment.
- [x] Client-side validation (`lib/equipmentStatus.js`) mirroring SPEC.md's
      rules (Run/Run Test/Spin/Crank rejected if already Running,
      Stop/Trip rejected if already Stopped, Swap requires primary Running
      + secondary Stopped) — re-checked against a freshly-fetched status
      snapshot right before submit, not just the snapshot the modal opened
      with, to close most of the race window between two people acting on
      the same equipment. Still app-layer only, not a DB trigger — see
      SPEC.md "Business rules enforced at the DB layer" for why, and
      revisit if this ever proves insufficient (e.g. a second client).
- [x] "(Running)" green label + a "History" button next to tracked,
      non-Generic equipment in the main view (`recordsTable.js`).
- [x] History modal (`historyModal.js`): all operation events for that
      unit (not date-range-limited — full history, per spec), Edit/Delete
      per event, permission-gated the same way as maintenance records (own
      event, or admin) via the same RLS already in place.
- [x] Admin view/restore/permanent-delete parity with maintenance records:
      "Show deleted" toggle in the History modal, `restore_operation_event`
      / `hard_delete_operation_event` RPCs
      (`20260830090000_admin_view_restore_operation_events.sql`). Added
      after initially deferring it — same pattern, applied once the
      History modal existed to expose it.
- [x] Editing an existing event skips the live-status validation
      (deliberate: enforcing "current" equipment status against an edit of
      a possibly-old event doesn't make sense — e.g. fixing a comment typo
      on a 3-day-old Run event shouldn't fail because the equipment is
      Stopped for unrelated reasons today). Ownership/admin RLS still
      governs who can edit at all.
- [x] Manually verified end-to-end against live data: create (each action
      + Swap), rejection messages, History, edit, delete, admin
      restore/permanent-delete, and the action-menu collapse fix all
      confirmed working in the real app.

**Exit criteria — met**: create a Run event, see the equipment show
"(Running)"; try to Run it again and get rejected; Stop it and see the tag
disappear; Swap two units and see both flip; open History and see all of
it, edit one event's comment, delete another and see it disappear from
history.

## Phase 4 — Date range filter

- [x] Maintenance records: existing overlap check
      (`start_date <= to AND (end_date IS NULL OR end_date >= from)`)
      already handled the open-ended-`end_date` edge case correctly from
      Phase 1/2 — nothing to change there.
- [x] ~~Operation events shown in the main view's per-equipment table~~ —
      built (combined chronologically with maintenance records via
      `lib/combinedTimeline.js`), then **explicitly reverted** (2026-08-30):
      operation events are viewed via the "History" button only, never in
      the main table. `lib/combinedTimeline.js` was kept rather than
      deleted — Phase 5's export needs the identical merge logic, just
      rendered to docx instead of HTML. See SPEC.md's revision note on the
      original "Date range filter" spec bullet.
- [x] Consistent `dd-mm-yyyy` date display everywhere records are shown
      read-only (`lib/dateFormat.js`) — `<input type="date">` /
      `<input type="datetime-local">` fields are unaffected (the browser
      requires `yyyy-mm-dd` / `yyyy-mm-ddTHH:mm` internally regardless of
      display format; that's a native-input constraint, not a choice).
- [x] Verified working end-to-end by the user.

**Exit criteria — met**: maintenance records still filter correctly by
date range; operation events are reachable only via History, not the main
table; every displayed date (main table, View modal, History) reads
dd-mm-yyyy consistently.

## Phase 4.5 — User management (added 2026-08-30, not in the original spec)

- [x] Admin can create a new account in-app: "Manage Users" → "+ Add
      user" (email, password, username, full name, role) — via the
      `admin-manage-users` Edge Function (needs `service_role`, see
      SPEC.md's "user management" decisions).
- [x] Admin can view all users (username, full name, email, role, active
      status) via `list_users()`, and edit role/username/full
      name/active status directly (plain RLS-governed update, new
      `profiles_update` policy).
- [x] Admin can set any other user's password (same Edge Function,
      `set-password` action).
- [x] Admin can permanently delete a user (same Edge Function, `delete`
      action) — blocked for their own account (self-lockout guard). The
      "Delete User" modal offers reassigning that user's
      records to a different, still-existing user first (fixes the
      foreign-key error that'd otherwise block deleting anyone who's ever
      created/edited a record); skipping reassignment and hitting that
      error is also fine — deactivate them instead in that case.
- [x] Any signed-in user can change their own password ("Change
      Password" in the header) — no Edge Function needed, re-verifies
      the current password first via a fresh sign-in.
- [x] Self-lockout guard: an admin can't demote or deactivate their own
      account through the "Manage Users" UI — confirmed by direct testing
      that doing so instantly revokes the caller's own access to
      everything (`is_allowed_user()`/`is_admin()` both check the
      *caller's* profile). UI-level guard only, not enforced server-side —
      see SPEC.md for why that's an accepted gap for now.
- [x] SQL migration applied and tested directly against the live DB. Edge
      Function deployed via the Supabase CLI (needs a one-time
      `supabase login` — doesn't auto-deploy via the GitHub integration
      like migrations, see SPEC.md). Verified end-to-end in the real app:
      create, edit, set-password, delete (with and without reassignment),
      change-own-password, and the self-lockout guard all confirmed
      working by the user.

**Exit criteria — met**: admin creates a new user via "Manage Users" and
that user can log in with the given credentials; admin edits another
user's role and it takes effect (RLS-enforced, not just hidden in the UI);
admin sets another user's password and they can log in with it; any user
changes their own password via "Change Password" and can log back in with
the new one; the "Manage Users" edit form refuses to let the signed-in
admin demote/deactivate themselves; deleting a user with records fails
cleanly, and succeeds once reassigned to another user.

## Phase 5 — `.docx` export

- [x] `docx` npm package integrated, lazy-loaded (`import()` inside the
      Export click handler, not a top-level import) — it's a large library
      (~350KB) needed only when Export is actually clicked, so this keeps
      it out of the bundle every other page load pays for. Confirmed via
      build output: main bundle back to ~253KB, `docx` split into its own
      chunk.
- [x] `lib/docxExport.js`: for the current filtered range, System banner
      (styled — dark solid fill, white bold text) → Equipment sub-header
      (styled — colored bold text, green "(Running)" suffix using live
      `equipment_status`) → one chronological table per equipment
      combining maintenance records + operation events, reusing
      `lib/combinedTimeline.js` (kept from the reverted Phase 4 attempt —
      the export is exactly the use case it was built for).
- [x] Swap events appear under **both** equipment involved (direction-aware
      label: "Swap → X" on the primary side, "Swap ← Y" on the secondary
      side) — verified directly by generating a real test document and
      inspecting its XML content, not just a clean build.
- [x] Omission rule refined (2026-08-30, after the initial "omit every
      empty system" pass): Workshop/Others/Scarab GTG are omitted entirely
      when empty (system **and** per-equipment, matching the main view's
      `hide_when_empty` rule exactly); the other three systems are never
      omitted and their real equipment always shows even with zero
      activity (a "No activity in this period" placeholder row) — but
      every system's "Generic" catch-all equipment entry is specifically
      omitted when it has no activity, tracked system or not. Verified
      directly: a real test document with one populated/one empty/one
      empty-Generic equipment per system confirmed exactly this.
- [x] Title reads "Handover - {exporter's full name}" (falls back to
      username, then email) — uses the same `profiles` name-resolution
      already built for "Created by" (Phase 4).
- [x] Table redesigned per feedback: Date/Status columns narrow (20% each,
      later widened from an initial 15%/20%), Scope wide (60%, initially
      65%) and now carries the whole record — bold
      `work_scope` (or the action, for an operation event), then a bulleted
      "Detailed Work Done:" section and a bulleted "Comments:" section,
      each omitted entirely when that field is empty rather than showing
      an empty heading. Maintenance rows show a `start - end` (or `start -
      Ongoing` for an open-ended record) date range instead of just the
      start date.
- [x] Export always excludes deleted rows regardless of whether the admin
      currently has "Show deleted" on for their own browsing — fetches
      fresh data with `includeDeleted: false` rather than reusing
      `state.records`, since the export is meant to be the "official"
      record for the period.
- [x] Column widths actually take effect in Word now (2026-08-30, two
      fixes, the first one insufficient on its own — Date/Scope/Status are
      20%/60%/20%). Attempt 1: `layout: TableLayoutType.FIXED` on the
      table — necessary but not sufficient; still rendered equal columns
      in real Word despite correct per-cell percentages in the XML.
      Attempt 2 (the actual fix): in fixed-layout mode Word reads column
      widths from the table's *grid* (`<w:tblGrid>`/`gridCol`, in DXA — 20ths
      of a point), not the per-cell percentages — `docx` was defaulting
      that grid to equal placeholder values regardless of the cell
      percentages. Set explicitly via `columnWidths` (an array of DXA
      values computed from the same percentages against 9360 DXA, the
      usable width of a default Letter page with 1" margins). Confirmed
      by inspecting `gridCol` directly this time (not just `tcW`, which
      is what the first, insufficient check had looked at) — a real gap
      between "structurally correct" and "renders correctly" in the exact
      same file, worth remembering for anything else docx-related.
- [x] Pagination: the header row is marked `tableHeader` (repeats on each
      page a table spans, and stops Word orphaning it alone at a page
      break with the data starting fresh on the next page); both the
      system banner and equipment header paragraphs are marked
      `keepNext` (stops either from being stranded alone at the bottom of
      a page with its table starting on the next one). All three
      confirmed present in a regenerated test document's XML.
- [x] Verified in an actual Word viewer, not just structurally — column
      widths, header/equipment-header pagination behavior, and bulleted
      Detailed Work Done/Comments (with a real minimal-indent hanging
      indent, not a plain text prefix) all confirmed by the user directly.

**Exit criteria — met**: click Export for the current date range, open the
downloaded `.docx` in Word and confirm it looks right — system banners,
equipment headers with Running status, combined chronological tables,
Swap under both units, empty systems omitted, correct column widths, no
awkward page-break orphaning.

## Phase 6 — PWA polish

- [x] Real icon set (192/512/maskable): **placeholder only** — still the
      ImageMagick-generated "H" icons from Phase 1, since no real branding
      has been provided yet. Left as a placeholder deliberately rather
      than blocking the rest of Phase 6 on it; swap the three files under
      `public/icons/` whenever real artwork exists, no code change needed.
- [x] Verified offline app-shell behavior on an actual device once
      deployed to Vercel — confirmed working by the user directly ("the
      mobile app is fine").
- [x] Loading/empty/error states: covered incrementally as each feature
      was built (loading/error text per view/modal, disabled buttons with
      a `title` reason rather than silently-failing actions) rather than
      as one dedicated pass — no gaps reported after real end-to-end use.

**Exit criteria — met**: installed and launched from a real phone's home
screen over genuine HTTPS, confirmed working by the user directly.

## Deploy

**Decided 2026-08-30: Vercel.** Needed now, not just eventually — Phase 6
can't be tested on a real phone without it (see above). Steps:

1. [vercel.com](https://vercel.com) → sign up/log in (GitHub login is
   simplest) → "Add New Project" → import this repo.
2. Vercel auto-detects Vite (framework preset, build command
   `npm run build`, output directory `dist`) — shouldn't need changing.
3. **Before deploying**, add the environment variables in the project's
   settings (Settings → Environment Variables) — `.env.local` is
   gitignored, so Vercel never sees it, and Vite bakes `VITE_*` vars into
   the build at build time, not at runtime:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (Same values as your local `.env.local`.)
4. Deploy. Vercel gives an `https://*.vercel.app` URL — open that on a
   phone (not the LAN IP of a dev machine) to test install/offline
   behavior for real.
5. Every push to the linked branch auto-redeploys from then on — same
   `git push` you're already doing for everything else.
