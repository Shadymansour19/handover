# Maintaining Handover without an AI assistant

A practical guide for editing, upgrading and recovering this app by hand.
For *what* the app should do and *why* decisions were made, see
[SPEC.md](SPEC.md). For setup from scratch, see [README.md](README.md). For
the frontend folder layout, see [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).

## How the pieces fit

| Piece | Where it lives | How changes ship |
| --- | --- | --- |
| Frontend (vanilla JS + Vite PWA) | `src/`, `index.html`, `public/` | `git push` → Vercel auto-builds and deploys |
| Database schema + security (RLS) | `supabase/migrations/*.sql` | `git push` → Supabase GitHub integration applies new files |
| Edge Function (create users / set passwords) | `supabase/functions/admin-manage-users` | **Manual**: `npx supabase functions deploy admin-manage-users` |
| Secrets | `.env.local` (local), Vercel env vars (production) | Never committed |

There is no backend server of your own: the browser talks straight to
Supabase. Security is enforced by Postgres RLS policies, not by frontend code,
so hiding a button is never enough to restrict something.

## Everyday workflow

```sh
npm install        # first time only
npm run dev        # local dev server with hot reload
npm run build      # production build into dist/ (also catches syntax errors)
```

1. Make the change in `src/`. Find the right file via
   [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). Rough map: `src/views/` =
   screens and modals, `src/data/` = all Supabase queries, `src/lib/` =
   helpers (dates, exports, spellcheck), `src/styles/` = CSS.
2. Test locally with `npm run dev`, using a real login.
3. `git add <files>`, `git commit -m "short message"`, `git push`.
4. Vercel redeploys automatically; check the deployment in the Vercel
   dashboard.

There are no automated tests. Always click through the feature you changed,
as both a normal user and an admin.

## Changing the database

Never edit an existing migration that has already been pushed. Add a new
file named `supabase/migrations/<YYYYMMDDHHMMSS>_description.sql`, with a
timestamp later than the last one, then push. Look at the most recent
migrations for the style used.

Things that have caused real bugs here:

- **RLS silently blocks writes**: an `UPDATE` or `INSERT` can "succeed" with
  zero rows changed when a policy disallows it, and no error appears. After
  any RLS change, test the exact action as a non-admin user.
- **Soft-delete**: an `UPDATE` also re-checks the SELECT policy on the new
  row, so a plain client update that hides a row fails. That is why deleting
  goes through a `SECURITY DEFINER` function (see
  `20260830050000_soft_delete_rpc.sql`). Copy that pattern.
- **New table = no access by default**: enable RLS and write policies, or it
  will be either inaccessible or wide open.

To inspect or fix data directly, use the Supabase dashboard (Table Editor or
SQL Editor). Direct `psql` access needs the pooler connection string from
Project Settings → Database.

## Common admin tasks

- **Add a user**: use "Manage Users" in the app (admin), or Supabase
  dashboard → Authentication → Users → Add user.
- **Make someone admin**: in the SQL Editor,
  `update public.profiles set role='admin' where username='name';`
- **Reset a password**: "Manage Users" → set password.
- **Add a system or equipment item**: insert into the `systems` /
  `equipment` tables (see the seed data in the initial migration for the
  columns). Check `src/lib/constants.js` in case the item needs special
  handling (tracked/running equipment).

## Upgrading dependencies

```sh
npm outdated
npm update          # minor/patch updates within package.json ranges
npm run build       # must pass
```

Major version bumps (Vite, `vite-plugin-pwa`, `docx`, `pdfmake`,
`@supabase/supabase-js`) can break things, so do them one at a time and test
each. Specifically re-test after upgrading:

- **docx / pdfmake**: export a `.docx` and a `.pdf`, then open the `.docx`
  in real Word and check the column widths. A clean build does not prove the
  layout is right.
- **vite-plugin-pwa**: check that the installed app still updates (the
  update banner in `src/lib/swUpdateBanner.js`) and launches offline.
- **supabase-js**: log in, create, edit and delete a record, and check live
  updates between two browsers (realtime).

## If something breaks

- **Site shows old version**: the PWA caches the app shell. Reload twice,
  or accept the update banner.
- **Login fails for everyone**: check the Supabase project isn't paused
  (the free tier pauses after about a week of inactivity) and that the
  `VITE_SUPABASE_*` variables in Vercel are correct.
- **Writes fail or do nothing**: almost always RLS. Check the browser
  console and Network tab for the Supabase response, then review the
  policies.
- **"Manage Users" fails**: the Edge Function may not be deployed or may be
  out of date. Redeploy it with the CLI command above, and read its logs in
  Supabase → Edge Functions → Logs.
- **Bad deploy**: in Vercel, "Promote" a previous deployment, or run
  `git revert <commit>` and push.

## Backups and continuity

- **Data**: the real data lives only in Supabase. Take a periodic export
  (dashboard → Database → Backups, or `pg_dump` using the connection
  string). Free-tier projects do not get downloadable daily backups, so
  schedule a manual dump (e.g. monthly) and keep it somewhere safe.
- **Code**: the GitHub repo is the source of truth. Keep the repo private
  but make sure more than one person has access.
- **Accounts to keep access to**: GitHub, Supabase, Vercel. Record who
  owns each, and store the admin credentials in a password manager rather
  than in the repo.
- Keep the `.env.local` values in a password manager; they are not in git.
