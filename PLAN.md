# Handover — phased build plan

STATUS: planning only — nothing below has been built yet.

Full feature scope is in [SPEC.md](SPEC.md). Building it in one pass isn't
the goal — each phase should be a working, reviewable increment.

## Phase 0 — Planning (done)

- [SPEC.md](SPEC.md), [schema.sql](schema.sql),
  [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md), this file.

## Phase 1 — Minimal slice: auth + read-only display

Goal: prove the auth/RLS/data path end to end before any write logic exists.

- [x] Vite scaffold + `vite-plugin-pwa` (manifest, generateSW, placeholder
      icons). `npm install` / `npm run build` both verified working.
- [x] `auth.js`: magic-link request form, session listener, sign-out.
- [x] `mainView.js`: fetch `systems` + `equipment` (ordered), fetch
      `maintenance_records` for a "last 7 days" default (adjustable) range,
      group by System → Equipment, render a read-only table (View/Edit/Delete
      buttons present but disabled — Phase 2). Hide-when-empty rule applied
      for Workshop/Others/Scarab GTG.
- [x] No writes, no operation events, no export yet — matches scope.
- [ ] **Not yet done — requires the project owner**: create the actual
      Supabase project, run `schema.sql`, disable public sign-ups, invite the
      ~10 real users, populate `allowed_users`, and fill in `.env.local`. See
      README.md "Setup". Code can't be end-to-end verified until this exists.

**Exit criteria**: a real user can log in via magic link and see live
maintenance records grouped correctly; a non-allowlisted email cannot see
any data even if they somehow get a session. Blocked on the Supabase setup
step above.

## Phase 2 — Maintenance CRUD

- "+ New Record" modal, Maintenance tab only (Operation tab stubbed/hidden).
- View modal with bullet-rendered `detailed_steps`/`comment`.
- Edit (own records only, per RLS) — `end_date` field disabled in the UI
  whenever `work_status` is non-terminal, mirroring the DB trigger.
- Delete = soft delete (sets `deleted_at` via UPDATE, not a real DELETE).

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
