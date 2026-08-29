# Handover

Industrial work-permit and equipment-tracking tool for an oil & gas facility,
migrating from Google Apps Script to Supabase + a static PWA.

**Status**: Phases 1–4.5 (auth, Maintenance CRUD, operation tracking,
date-range display, user management) are verified end-to-end. Phase 5
(`.docx` export) is built and structurally verified (a generated test
document was inspected directly) but not yet opened in an actual Word
viewer — see [PLAN.md](PLAN.md) for what's built vs. what's next.

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
7. **Deploy the Edge Function** (needed for "Manage Users" — creating
   accounts and setting someone else's password; everything else doesn't
   need this step). Unlike `supabase/migrations/`, this does **not**
   auto-deploy via the GitHub integration — it needs the Supabase CLI,
   logged in once:

   ```sh
   npx supabase login
   npx supabase link --project-ref pfkpvkaybylrdnfwycxn
   npx supabase functions deploy admin-manage-users
   ```

8. **Install and run**:

   ```sh
   npm install
   npm run dev
   ```

## What's implemented (Phase 1 + 2 + 3 + 4 + 4.5 + 5)

- Username-or-email + password login screen, session handling, sign-out.
- Main view: shows the signed-in user's username + role (admin/user),
  fetches `systems`/`equipment` and `maintenance_records` (default date
  range = last 7 days, adjustable), groups by System → Equipment, and
  applies the hide-when-empty rule for Workshop/Others/Scarab GTG. Every
  displayed date reads `dd-mm-yyyy` consistently.
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
  opening the full event history for that unit (not shown in the main
  table itself — History-only, by design), with permission-gated
  Edit/Delete per event and the same admin view/restore/permanent-delete as
  maintenance records.
- "Manage Users" (admin-only, in the header): view every user with their
  email, create a new account, edit role/username/full name/active status,
  set anyone's password — see SPEC.md "user management" for what needs the
  Edge Function vs. a plain RLS-governed update.
- "Change Password" (any signed-in user, in the header): change your own
  password, with current-password re-verification.
- "Export" button: `.docx` for the current filtered date range — System
  banner → Equipment sub-header (shows Running status) → one chronological
  table per equipment combining maintenance records + operation events,
  Swap events under both units, empty systems omitted entirely. The `docx`
  library is lazy-loaded only when Export is clicked, not part of the main
  bundle.
- PWA app-shell caching (installable, launches offline) via `vite-plugin-pwa`.

Not yet implemented: PWA polish (Phase 6) — see [PLAN.md](PLAN.md).

Icons in `public/icons/` are placeholders generated with ImageMagick
(Phase 6 replaces them with real branding).
