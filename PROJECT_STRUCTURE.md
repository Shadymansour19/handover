# Handover — frontend folder structure

Vanilla JS + Vite, built as a PWA via `vite-plugin-pwa` (generateSW strategy
— app-shell caching only, per SPEC.md). No UI framework. This reflects the
actual current tree (Phase 1 + 2 + 3 built) — see PLAN.md for what's still
planned in later phases.

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
│   └── migrations/             # canonical schema; auto-deployed on push, see README "Setup"
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
    │   ├── layout.css          # app header + toolbar chrome
    │   ├── records.css         # system/equipment grouping, records table, row "⋮" menu
    │   └── modal.css           # modal chrome, record form, read-only View modal fields
    │
    ├── lib/
    │   ├── constants.js        # WORK_STATUSES, ACTIONS, terminal-status check — mirror the DB enums
    │   ├── dateRange.js        # default "last 7 days", ISO-date + datetime-local input helpers
    │   ├── bullets.js          # \n-text -> bullet-list HTML for the View modal
    │   ├── html.js             # escapeHTML — shared by every hand-rolled innerHTML template
    │   ├── icons.js            # inline SVG action icons (view/edit/delete/restore)
    │   ├── modal.js            # openModal(): overlay/close/escape-key boilerplate, used by every modal
    │   ├── equipmentStatus.js  # pure: dropdown filtering + pre-submit validation for operation events
    │   └── docxExport.js       # Phase 5: docx generation
    │
    ├── data/                   # thin wrappers around supabase-js calls — no UI logic
    │   ├── maintenanceRecords.js  # fetch + create + update + soft-delete/restore/hard-delete
    │   ├── operationEvents.js     # fetch/history + create/update + soft-delete; equipment_status fetch
    │   ├── profiles.js            # own profile fetch, username-or-email login resolution
    │   └── systemsEquipment.js    # reference data (systems + nested equipment, ordered)
    │
    └── views/                  # each view is a function that renders into a container element
        ├── loginView.js        # username/email + password form
        ├── mainView.js         # controller: DOM wiring, event delegation, data orchestration
        ├── recordsTable.js     # pure rendering: (systems, records, permissions, equipmentStatuses)
        │                       # -> HTML string; split out of mainView.js once that mixed concerns
        ├── newRecordModal.js   # "+ New Record": Maintenance/Operation tab toggle over the two forms
        ├── recordModal.js      # renderMaintenanceForm (embeddable) + openMaintenanceRecordModal (edit)
        ├── operationEventModal.js  # renderOperationForm (embeddable) + openOperationEventModal (edit)
        ├── viewRecordModal.js  # read-only View modal, bullet rendering
        └── historyModal.js     # all operation events for one unit; Edit/Delete per event
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
  factors out the overlay/close/escape-key plumbing so `recordModal.js` and
  `viewRecordModal.js` don't repeat it; each modal still builds its own
  innerHTML string and wires its own listeners directly.
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
- **Env vars**: Vite exposes `import.meta.env.VITE_*` — so `.env.local` keys
  should be `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The anon key is
  safe to ship client-side; it relies entirely on RLS (see
  `supabase/migrations/`) for protection, which is why the allowlist
  enforcement there matters.
- **Deploy target** (Vercel or Netlify, either is a static Vite build): not
  decided yet — doesn't affect any code above, can be picked whenever.
