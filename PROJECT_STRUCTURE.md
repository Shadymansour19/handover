# Handover — frontend folder structure

Vanilla JS + Vite, built as a PWA via `vite-plugin-pwa` (generateSW strategy
— app-shell caching only, per SPEC.md). No UI framework. This reflects the
actual current tree (Phase 1 + 2 built) — see PLAN.md for what's still
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
    ├── styles/
    │   └── main.css            # single global stylesheet to start; split later if it grows
    │
    ├── lib/
    │   ├── constants.js        # WORK_STATUSES, terminal-status check — mirrors the DB enum/trigger
    │   ├── dateRange.js        # default "last 7 days", ISO-date helpers
    │   ├── bullets.js          # \n-text -> bullet-list HTML for the View modal
    │   ├── html.js             # escapeHTML — shared by every hand-rolled innerHTML template
    │   ├── modal.js            # openModal(): overlay/close/escape-key boilerplate, used by both modals
    │   ├── equipmentStatus.js  # Phase 3: fetch equipment_status view; running/stopped helpers
    │   └── docxExport.js       # Phase 5: docx generation
    │
    ├── data/                   # thin wrappers around supabase-js calls — no UI logic
    │   ├── maintenanceRecords.js  # fetch + create + update + soft-delete
    │   ├── profiles.js            # own profile fetch, username-or-email login resolution
    │   ├── systemsEquipment.js    # reference data (systems + nested equipment, ordered)
    │   └── operationEvents.js     # Phase 3
    │
    └── views/                  # each view is a function that renders into a container element
        ├── loginView.js        # username/email + password form
        ├── mainView.js         # grouped System -> Equipment table, toolbar, permission-gated actions
        ├── recordModal.js      # + New Record / Edit — Maintenance form (Operation tab is Phase 3)
        ├── viewRecordModal.js  # read-only View modal, bullet rendering
        └── historyModal.js     # Phase 3: operation events history per equipment
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
- **Env vars**: Vite exposes `import.meta.env.VITE_*` — so `.env.local` keys
  should be `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The anon key is
  safe to ship client-side; it relies entirely on RLS (see
  `supabase/migrations/`) for protection, which is why the allowlist
  enforcement there matters.
- **Deploy target** (Vercel or Netlify, either is a static Vite build): not
  decided yet — doesn't affect any code above, can be picked whenever.
