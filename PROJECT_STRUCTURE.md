# Handover — frontend folder structure

Vanilla JS + Vite, built as a PWA via `vite-plugin-pwa` (generateSW strategy
— app-shell caching only, per SPEC.md). No UI framework. This reflects the
actual current tree (Phase 1 + 2 + 3 + 4 + 4.5 + 5 built) — see PLAN.md for
what's still planned in later phases.

```text
handover/
├── index.html                  # single entry point; views are swapped in JS, not routed pages
├── vite.config.js              # vite-plugin-pwa config: manifest + generateSW
├── package.json
├── .env.local                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored)
├── .gitignore
├── README.md
│
├── supabase/
│   ├── config.toml             # minimal — no local Docker dev, GitHub-integration deploy only
│   ├── migrations/             # canonical schema; auto-deployed on push, see README "Setup"
│   └── functions/
│       └── admin-manage-users/ # create account / set someone else's password (needs service_role);
│                                # deployed separately via Supabase CLI, NOT the GitHub integration
│
├── public/
│   └── icons/                  # 192x192, 512x512, maskable — placeholders, real branding is Phase 6
│
└── src/
    ├── main.js                 # bootstrap: init Supabase client, check session, mount a view
    ├── supabaseClient.js       # single createClient() instance, imported everywhere
    ├── auth.js                 # email/username + password sign-in, session listener, sign-out
    │
    ├── styles/                 # split by concern (see Notes) — main.css is just @import lines
    │   ├── main.css            # entry point, imports the rest in dependency order
    │   ├── variables.css       # :root custom properties
    │   ├── base.css            # reset, page shell, generic button/status/error styles
    │   ├── login.css           # login screen
    │   ├── layout.css          # app header + floating action button (FAB) cluster chrome
    │   ├── records.css         # system/equipment grouping, records table, row "⋮" menu
    │   └── modal.css           # modal chrome, record form, read-only View modal fields
    │
    ├── lib/
    │   ├── constants.js        # WORK_STATUSES, ACTIONS, terminal-status check — mirror the DB enums
    │   ├── dateRange.js        # default "last 7 days"; ISO-date + datetime-local INPUT-value helpers
    │   ├── dateFormat.js       # dd-mm-yyyy DISPLAY formatting — never used for input values (see
    │   │                       # dateRange.js; those must stay browser-native yyyy-mm-dd)
    │   ├── bullets.js          # \n-text -> bullet-list HTML for the View modal
    │   ├── html.js             # escapeHTML — shared by every hand-rolled innerHTML template
    │   ├── icons.js            # inline SVG action icons (view/edit/delete/restore)
    │   ├── modal.js            # openModal(): overlay/close/escape-key + onClose() cleanup hook
    │   ├── equipmentStatus.js  # pure: dropdown filtering + pre-submit validation for operation events
    │   ├── combinedTimeline.js # pure: merges one equipment's records+events into one sorted list —
    │   │                       # built for Phase 4's main-table attempt (since reverted), kept for
    │   │                       # Phase 5's export, which needs the identical merge logic
    │   └── docxExport.js       # docx generation — dynamically import()'d from mainView.js's
    │                           # Export handler, not a top-level import (keeps the ~350KB
    │                           # docx library out of the main bundle until actually needed)
    │
    ├── data/                   # thin wrappers around supabase-js calls — no UI logic
    │   ├── maintenanceRecords.js  # fetch + create + update + soft-delete/restore/hard-delete
    │   ├── operationEvents.js     # fetch (range + per-equipment history) + create/update +
    │   │                          # soft-delete/restore/hard-delete; equipment_status fetch
    │   ├── profiles.js            # own profile fetch, username-or-email login resolution
    │   ├── users.js                # admin user management: list_users(), profiles update (RLS),
    │   │                           # + the two Edge-Function-backed calls (create, set-password)
    │   └── systemsEquipment.js    # reference data (systems + nested equipment, ordered)
    │
    └── views/                  # each view is a function that renders into a container element
        ├── loginView.js        # username/email + password form
        ├── mainView.js         # controller: DOM wiring, event delegation, data orchestration
        ├── recordsTable.js     # pure rendering: (systems, records, permissions, equipmentStatuses)
        │                       # -> HTML string, maintenance records only (operation events are
        │                       # History-only — see combinedTimeline.js's note above)
        ├── newRecordModal.js   # "+ New Record": Maintenance/Operation tab toggle over the two forms
        ├── recordModal.js      # renderMaintenanceForm (embeddable) + openMaintenanceRecordModal (edit)
        ├── operationEventModal.js  # renderOperationForm (embeddable) + openOperationEventModal (edit)
        ├── viewRecordModal.js  # read-only View modal, bullet rendering
        ├── historyModal.js     # all operation events for one unit; Edit/Delete per event; admin
        │                       # "Show deleted" + Restore/Delete-forever, same as maintenance records
        ├── manageUsersModal.js # admin-only: list/create/edit users, set anyone's password
        ├── changePasswordModal.js  # any signed-in user: change their own password
        └── filterModal.js      # date range + admin-only "show deleted" dialog, opened from the
                                 # main view's Filter FAB (see mainView.js's FAB cluster, Notes below)
```

## Notes

- **No bundler-framework, no router library.** With only a handful of
  screens (login, main view, a few modals), swapping DOM content by hand in
  `main.js` is simpler than pulling in a router. Revisit only if the view
  count grows a lot.
- **`data/` vs `lib/`**: `data/*.js` talks to Supabase (queries, mutations)
  and returns plain objects/arrays; `lib/*.js` is pure logic (date overlap,
  status derivation helpers, docx building) that's easy to unit-test without
  a network call.
- **Modals aren't a framework-style component system** — `lib/modal.js` just
  factors out the overlay/close/escape-key plumbing so every modal file
  doesn't repeat it; each modal still builds its own innerHTML string and
  wires its own listeners directly. `manageUsersModal.js` and
  `historyModal.js` both also use `onClose()` (returned by `openModal`) to
  clean up their own document-level "outside click" listener, since that
  listener would otherwise leak (re-added, never removed) every time the
  modal reopens.
- **CSS is split by concern, not by component** — there's no CSS-in-JS or
  scoping, so `styles/*.css` files are just named groupings (login, layout,
  records table, modals) plumbed together via `@import` from `main.css`.
  Split once `main.css` passed ~250 lines and mixing concerns made it hard
  to find anything; before that, one file was simpler and fine.
- **`mainView.js` vs `recordsTable.js`** — same reasoning as the CSS split:
  `mainView.js` had grown to mix DOM wiring/event handling with pure
  data-to-HTML rendering functions. `recordsTable.js` holds only the pure
  part (`renderSystemsHTML` and its private helpers) — no DOM queries, no
  listeners, easy to reason about (or eventually test) in isolation.
- **`renderMaintenanceForm`/`renderOperationForm` are embeddable, not just
  modal-only** — each fills a given container element and wires itself,
  independent of how that container got on the page. `newRecordModal.js`
  embeds both (one per tab) inside one modal for "+ New Record";
  `openMaintenanceRecordModal`/`openOperationEventModal` each just wrap
  their form in a single-purpose modal for editing an existing record.
  Avoids duplicating the form logic between the two entry points.
- **Edge Function vs. plain client calls for user management** — only
  creating an account and setting someone ELSE's password go through
  `admin-manage-users` (they need `service_role`, which can never reach the
  browser); viewing users, editing role/username/active status, and
  changing your OWN password are all plain RLS-governed client calls. See
  SPEC.md "2026-08-30 — user management" for the full reasoning per case.
- **Env vars**: Vite exposes `import.meta.env.VITE_*` — so `.env.local` keys
  should be `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The anon key is
  safe to ship client-side; it relies entirely on RLS (see
  `supabase/migrations/`) for protection, which is why the allowlist
  enforcement there matters.
- **Deploy target**: Vercel (see SPEC.md "Deploy").
- **Main view toolbar is a floating action button (FAB) cluster, not an
  inline row** — Add Record/Filter/Export are hidden by default behind a
  single bottom-right dots FAB (`mainView.js`); Sign Out/Change
  Password/Manage Users are similarly collapsed behind a header hamburger
  button. Both reuse the same `setupToggle()` helper (open/close + close on
  outside click), itself a generalization of the row-menu (⋮) dropdown
  mechanics already used for per-row/per-user actions — see SPEC.md
  "2026-08-30 — main view toolbar redesign".
