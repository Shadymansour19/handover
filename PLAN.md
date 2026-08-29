# Handover — phased build plan

Full feature scope is in [SPEC.md](SPEC.md). Building it in one pass isn't
the goal — each phase should be a working, reviewable increment. Current
status: Phase 1 is built; see its checklist below for what's still pending
on the Supabase-setup side.

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
- [x] Delete = soft delete (`softDeleteMaintenanceRecord`, sets
      `deleted_at`). Checks the update actually affected a row rather than
      trusting a 200 response — PostgREST returns success even when RLS
      silently blocks an update that matches 0 rows, which would otherwise
      look like "delete succeeded" when it didn't.
- [ ] Not yet manually verified against live data (build is clean, but no
      one has clicked through create → edit → delete → view against the
      real Supabase project yet).

**Exit criteria**: create a record, see it appear grouped correctly; edit
it and see the change persist; soft-delete it and see it disappear from the
list; confirm a non-owner, non-admin account can't edit/delete it (buttons
disabled) while the admin can.

## Phase 3 — Operation tracking

- Operation tab in "+ New Record": Action → Timestamp → System → Equipment
  (filtered via `equipment_status` per the action's required state) →
  Secondary Equipment (Swap only, filtered to Stopped units) → Comment.
- Client-side validation mirroring spec rules (Run rejected if already
  Running, etc.) before insert; surface the DB trigger's rejection message
  as a fallback for anything the client missed.
- "(Running)" green label next to tracked equipment in the main view.
- "History" modal per tracked equipment: list events, Edit/Delete (own
  events only).

## Phase 4 — Date range filter

- Wire the From/To filter (default last 7 days) across both record types in
  the main view: maintenance records show on date-range overlap, operation
  events show if their date falls in range.
- Edge cases: open-ended `end_date` (still in progress) counted as
  overlapping today onward; single-day filter (From == To).

## Phase 5 — `.docx` export

- Integrate the `docx` npm package.
- For the current filtered range: System banner (styled) → Equipment
  sub-header (styled, shows Running status) → one chronological table
  combining maintenance records + operation events. Swap events appear
  under both equipment involved.
- Omit any system with zero activity in the period (not just
  Workshop/Others/Scarab GTG — all systems, per spec).

## Phase 6 — PWA polish

- Real icon set (192/512/maskable), manifest metadata, install-prompt UX.
- Verify offline app-shell behavior on an actual device (Android + iOS
  "Add to Home Screen"), confirm the "offline shows last-loaded data, no
  writes" behavior matches SPEC.md's chosen scope.
- Pass over loading states, empty states, and error messages (e.g. what a
  signed-in-but-not-allowlisted user actually sees).

## Deploy

Pick Vercel or Netlify at Phase 1 (either works identically for a static
Vite build — no decision needed ahead of time).
