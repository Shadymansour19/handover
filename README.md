# Handover

Industrial work-permit and equipment-tracking tool for an oil & gas facility,
migrating from Google Apps Script to Supabase + a static PWA.

**Status**: Phases 1–3 (auth, Maintenance CRUD, operation tracking) are
verified end-to-end. Phase 4 (unified date-range filter) is built but not
yet manually verified against live data — see [PLAN.md](PLAN.md) for
what's built vs. what's next.

## Reference docs

- [SPEC.md](SPEC.md) — full requirements + the decisions and assumptions
  made so far. Read this first.
- [supabase/migrations/](supabase/migrations/) — Postgres schema + RLS
  policies, deployed automatically via Supabase's GitHub integration.
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — frontend folder layout.
- [PLAN.md](PLAN.md) — phased build plan.

## Setup

1. **Create a Supabase project** (free tier is fine) — project ref
   `pfkpvkaybylrdnfwycxn`.
2. **Link the GitHub repo** (Project Settings > Integrations > GitHub),
   working directory `.`. Pushing to the linked branch auto-deploys any new
   file under `supabase/migrations/`, so the schema ships on `git push`
   rather than being pasted into the SQL editor by hand. (A brand-new
   project can briefly reject writes with a
   "cannot execute ... in a read-only transaction" error while it finishes
   provisioning — wait for the project status to go green and retry.)
3. **Auth settings** (Authentication > Settings): keep public sign-ups
   disabled — accounts are admin-created only (see SPEC.md "auth pivot").
4. **Create accounts** (Authentication > Users > "Add user"): one for
   yourself (the admin) and one for each of the ~10 real users, each with an
   email + password you hand out directly. A trigger auto-creates each
   user's `profiles` row (`username` guessed from their email, `role =
   'user'`) — you don't need to insert that by hand.
5. **Promote yourself to admin**: in the SQL editor,
   `update public.profiles set role = 'admin', username = 'yourname' where
   id = (select id from auth.users where email = 'you@example.com');`
   (Not part of the migration on purpose — see
   [supabase/migrations/](supabase/migrations/); it's real user data, not
   schema.) Optionally fix up the other users' auto-guessed usernames the
   same way.
6. **Configure the frontend**: copy `.env.local.example` to `.env.local` and
   fill in your project's URL + anon key (Project Settings > API).
7. **Install and run**:

   ```sh
   npm install
   npm run dev
   ```

## What's implemented (Phase 1 + 2 + 3 + 4)

- Username-or-email + password login screen, session handling, sign-out.
- Main view: shows the signed-in user's username + role (admin/user),
  fetches `systems`/`equipment` and `maintenance_records` (default date
  range = last 7 days, adjustable), groups by System → Equipment, and
  applies the hide-when-empty rule for Workshop/Others/Scarab GTG.
- "+ New Record" modal with a Maintenance/Operation tab toggle. Maintenance:
  create/Edit (same form, pre-filled), read-only View modal with
  bullet-rendered `detailed_steps`/`comment`, soft-delete, admin
  view/restore/permanently-delete of deleted records — all permission-gated
  (own records for regular users, any record for admin).
- Operation tab: Action → Timestamp → System → Equipment (auto-filtered to
  valid units for the chosen action) → Secondary Equipment (Swap only) →
  Comment, with the Run/Stop/Trip/Swap validation rules from SPEC.md
  enforced client-side.
- Tracked equipment (PHVII GTG / Main Compressor / Booster Compressor,
  excluding Generic) shows a green "(Running)" tag and a "History" button
  opening the full event history for that unit, with permission-gated
  Edit/Delete per event and the same admin view/restore/permanent-delete as
  maintenance records.
- The main view's per-equipment table now shows operation events alongside
  maintenance records, combined into one chronologically-sorted table
  within the current date filter — not just visible via History anymore. A
  Swap shows under both units involved.
- PWA app-shell caching (installable, launches offline) via `vite-plugin-pwa`.

Not yet implemented: `.docx` export — see [PLAN.md](PLAN.md) Phase 5, and
PWA polish (Phase 6).

Icons in `public/icons/` are placeholders generated with ImageMagick
(Phase 6 replaces them with real branding).
