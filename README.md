# Handover

Industrial work-permit and equipment-tracking tool for an oil & gas facility,
migrating from Google Apps Script to Supabase + a static PWA.

**Status**: Phase 1 (auth + read-only display) is scaffolded — see
[PLAN.md](PLAN.md) for what's built vs. what's next.

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
3. **Auth settings** (Authentication > Settings): disable public sign-ups.
4. **Invite users** (Authentication > Users): "Invite user" for each of the
   ~10 real users — this pre-creates their accounts so magic link works
   only for them.
5. **Populate the allowlist**: in the SQL editor,
   `insert into public.allowed_users (email) values ('a@b.com'), (...);`
   for the same emails (lowercase). (Not part of the migration on purpose —
   see [supabase/migrations/](supabase/migrations/); it's real user data,
   not schema.)
6. **Configure the frontend**: copy `.env.local.example` to `.env.local` and
   fill in your project's URL + anon key (Project Settings > API).
7. **Install and run**:

   ```sh
   npm install
   npm run dev
   ```

## What's implemented (Phase 1)

- Magic-link login screen, session handling, sign-out.
- Main view: fetches `systems`/`equipment` and `maintenance_records` (default
  date range = last 7 days, adjustable), groups by System → Equipment, and
  applies the hide-when-empty rule for Workshop/Others/Scarab GTG.
- PWA app-shell caching (installable, launches offline) via `vite-plugin-pwa`.

Not yet implemented: creating/editing/deleting records, operation-event
tracking and derived Running/Stopped status, and `.docx` export — see
[PLAN.md](PLAN.md) Phases 2–6. View/Edit/Delete buttons in the UI are
present but disabled as a placeholder for Phase 2.

Icons in `public/icons/` are placeholders generated with ImageMagick
(Phase 6 replaces them with real branding).
