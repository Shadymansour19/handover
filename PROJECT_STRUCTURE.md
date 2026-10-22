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
├── branding/
│   └── logo-source.png         # master render the public/icons/*.png files are regenerated
│                                # from — deliberately NOT under public/ (Vite copies that
│                                # verbatim into every deploy; a 2.3MB source file doesn't need
│                                # to ship to production, and broke the build outright once
│                                # workbox tried to precache it — see SPEC.md "real app icon"
│                                # fixed 2026-09-23)
│
├── public/
│   └── icons/                  # 192x192, 512x512, maskable, apple-touch-icon — real branding
│                                # (see SPEC.md "real app icon")
│
└── src/
    ├── main.js                 # bootstrap: init Supabase client, check session, mount a view,
    │                           # register the service worker (virtual:pwa-register — not the
    │                           # plugin's own auto-injected script, see lib/swUpdateBanner.js)
    ├── supabaseClient.js       # single createClient() instance, imported everywhere
    ├── auth.js                 # email/username + password sign-in, session listener, sign-out
    │
    ├── styles/                 # split by concern (see Notes) — main.css is just @import lines
    │   ├── main.css            # entry point, imports the rest in dependency order
    │   ├── variables.css       # :root custom properties — light by default, dark under
    │   │                       # prefers-color-scheme (see SPEC.md "light/dark theme")
    │   ├── base.css            # reset, page shell, generic button/status/error styles
    │   ├── login.css           # login screen
    │   ├── layout.css          # app header + floating action button (FAB) cluster chrome
    │   ├── records.css         # system/equipment grouping, records table, row "⋮" menu
    │   └── modal.css           # modal chrome, record form, read-only View modal fields
    │
    ├── lib/
    │   ├── constants.js        # WORK_STATUSES, ACTIONS, terminal-status check — mirror the DB enums
    │   ├── dateRange.js        # default "last 7 days" + Last 30 days/This month presets
    │   │                       # (filterModal.js); ISO-date + datetime-local INPUT-value helpers
    │   ├── filterPersistence.js    # loadSavedFilter()/saveFilter() — remembers the main view's
    │   │                           # date range/search/"show deleted"/Maintenance-or-Operations
    │   │                           # view across a page refresh, via localStorage
    │   ├── dateFormat.js       # dd-mm-yyyy DISPLAY formatting — never used for input values (see
    │   │                       # dateRange.js; those must stay browser-native yyyy-mm-dd)
    │   ├── staleness.js        # staleDays(): a non-terminal-status record past its own
    │   │                       # threshold without an update — see SPEC.md "stale-record flagging"
    │   ├── undoToast.js        # showUndoToast(): short-lived "Undo" toast after a soft-delete
    │   ├── bullets.js          # \n-text -> (possibly nested) bullet-list HTML for the View modal —
    │   │                       # a line's leading tabs (richTextField.js) set its nesting depth,
    │   │                       # inlineFormatting.js's **bold** markers become <strong>
    │   ├── inlineFormatting.js     # parseInlineBold(): **bold** markers -> {text, bold} segments —
    │   │                           # shared parsing, one rendering step per target (bullets.js,
    │   │                           # docxExport.js, pdfExport.js, richTextField.js)
    │   ├── richTextField.js    # contenteditable model for the multi-line fields (detailed_steps/
    │   │                       # comment/pending, operation events' own comment) — one `.rich-line`
    │   │                       # div per line (depth via `data-depth`, driving a live bullet glyph
    │   │                       # + indent via CSS), live `<strong>` for bold. Replaced a plain
    │   │                       # `<textarea>` so bold/bullets render as they'll actually look while
    │   │                       # editing, not as literal `**markers**`/tabs — SPEC.md "live
    │   │                       # bold/bullet rendering in the editor". getRichTextValue()/
    │   │                       # setRichTextValue() are what recordModal.js/operationEventModal.js
    │   │                       # use in place of a textarea's `.value`
    │   ├── textCase.js         # toTitleCase() (work_scope) / capitalizeLines() (the other
    │   │                       # multi-line fields) — applied once, on submit; capitalizes the
    │   │                       # first LETTER, skipping past a leading **bold** marker if present
    │   ├── listFormatToolbar.js    # Outdent/Indent/Bold toolbar for a richTextField.js field —
    │   │                           # attachListFormatToolbar(el); Tab/Shift+Tab/Ctrl+B do the same
    │   ├── spellcheck.js       # findMisspellings()/suggestionsFor()/addToDictionary() — nspell +
    │   │                       # dictionary-en (lazy-loaded) plus technicalDictionary.js's built-in
    │   │                       # terms and any user-taught words from localStorage
    │   ├── technicalDictionary.js  # TECHNICAL_TERMS — industrial/rotating-equipment vocabulary
    │   │                           # dictionary-en doesn't know (thermocouple, RTD, PLC, HVAC, ...)
    │   ├── spellcheckFlow.js   # runSpellcheck(): loops the per-word suggestion dialog (pick a
    │   │                       # suggestion, Skip, Skip all, or Add to Dictionary) over every
    │   │                       # misspelling across a set of fields, called from the submit handlers
    │   ├── html.js             # escapeHTML — shared by every hand-rolled innerHTML template
    │   ├── icons.js            # inline SVG icons — row/table actions plus the FAB cluster and
    │   │                       # header menu's larger ones (plus/filter/export/pdf/dots/menu/...)
    │   ├── modal.js            # openModal(): overlay/close/escape-key + onClose() cleanup hook
    │   ├── dropdownPosition.js # positionDropdownToFit(): flips a row-menu__dropdown upward when
    │   │                       # there isn't enough viewport room below its trigger
    │   ├── passwordToggle.js   # shared show/hide markup + wiring for every password field — a
    │   │                       # native browser reveal icon isn't reliable across mobile browsers
    │   ├── swUpdateBanner.js   # "Update available" banner — shown instead of vite-plugin-pwa's
    │   │                       # own default silent window.location.reload() on a new deploy (see
    │   │                       # SPEC.md "stale app after a deploy")
    │   ├── equipmentStatus.js  # pure: dropdown filtering + pre-submit validation for operation events
    │   ├── combinedTimeline.js # pure: merges one equipment's records+events into one sorted list —
    │   │                       # Phase 5's export's own grouping (chronological, both types
    │   │                       # together); the main view's own Maintenance/Operations toggle
    │   │                       # (operationEventsTable.js) shows the two separately instead
    │   ├── downloadBlob.js     # triggers a browser "Save As" for a Blob — split out of docxExport.js
    │   │                       # into its own zero-dependency file so it can be shared with
    │   │                       # pdfExport.js without statically importing (and thus bundling)
    │   │                       # either export library into the other's lazy chunk
    │   ├── realtime.js         # subscribeToChanges(): live-sync postgres_changes subscription —
    │   │                       # see SPEC.md "live sync between users"
    │   ├── docxExport.js       # docx generation — dynamically import()'d from mainView.js's
    │   │                       # Export handler, not a top-level import (keeps the ~350KB
    │   │                       # docx library out of the main bundle until actually needed)
    │   └── pdfExport.js        # pdf generation via pdfmake — same lazy-import treatment as
    │                           # docxExport.js (pdfmake + its bundled fonts are much larger
    │                           # still); mirrors docxExport.js's content/omission rules exactly,
    │                           # only the rendering API differs — see SPEC.md "2026-08-30 —
    │                           # .pdf export added"
    │
    ├── data/                   # thin wrappers around supabase-js calls — no UI logic
    │   ├── maintenanceRecords.js  # fetch + create + update + soft-delete/restore/hard-delete;
    │   │                          # fetchPriorWorkScopes() backs recordModal.js's autocomplete;
    │   │                          # `pending` is the same kind of optional \n-text field as
    │   │                          # detailed_steps/comment, just without a required counterpart
    │   ├── operationEvents.js     # fetch (range + per-equipment history) + create/update +
    │   │                          # soft-delete/restore/hard-delete; equipment_status fetch
    │   ├── profiles.js            # own profile fetch, username-or-email login resolution
    │   ├── users.js                # admin user management: list_users(), profiles update (RLS),
    │   │                           # + the two Edge-Function-backed calls (create, set-password)
    │   ├── recordAccess.js         # per-record access grants — fetch/set, parameterized by
    │   │                           # recordType ('maintenance' | 'operation') rather than one
    │   │                           # copy per table (see SPEC.md "per-record access grants")
    │   └── systemsEquipment.js    # reference data (systems + nested equipment, ordered)
    │
    └── views/                  # each view is a function that renders into a container element
        ├── loginView.js        # username/email + password form
        ├── mainView.js         # controller: DOM wiring, event delegation, data orchestration
        ├── recordsTable.js     # pure rendering: (systems, records, permissions, equipmentStatuses)
        │                       # -> HTML string, maintenance records only — mainView.js's
        │                       # Maintenance side of the Maintenance/Operations toggle
        ├── operationEventsTable.js # same shape as recordsTable.js, operation events instead —
        │                           # mainView.js's Operations side of that toggle (SPEC.md
        │                           # "maintenance/operations toggle view"); Edit/Delete per event,
        │                           # admin "Show deleted" (shared with the main Filter dialog) +
        │                           # Restore/Delete-forever, same as maintenance records. Scoped to
        │                           # the current date filter — unlike the old History modal this
        │                           # replaced (SPEC.md "remove the History button"), not all-time
        ├── operationEventDisplay.js  # operationActionLabel()/operationActionDescription() (the
        │                             # Swap-direction wording) + openViewOperationEventModal() —
        │                             # shared by operationEventsTable.js and mainView.js's own
        │                             # click handler, split out once the History modal that
        │                             # originally held them was removed
        ├── newRecordModal.js   # "+ New Record": Maintenance/Operation tab toggle over the two
        │                       # forms; opens on whichever tab matches mainView.js's current view
        ├── recordModal.js      # renderMaintenanceForm (embeddable) + openMaintenanceRecordModal
        │                       # (edit) — case normalization + spellcheck run on submit
        │                       # (lib/textCase.js, lib/spellcheckFlow.js)
        ├── operationEventModal.js  # renderOperationForm (embeddable) + openOperationEventModal
        │                           # (edit) — same submit-time case/spellcheck treatment for comment
        ├── viewRecordModal.js  # read-only View modal, bullet rendering
        ├── manageUsersModal.js # admin-only: list/create/edit users, set anyone's password
        ├── manageRecordAccessModal.js  # admin-only: grant/revoke one other user's access to a
        │                               # specific record — shared by recordsTable.js/
        │                               # operationEventsTable.js
        ├── staleRecordsModal.js    # once-per-session popup listing stale records the current
        │                           # user can act on (lib/staleness.js) — "take action" = Edit
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
  wires its own listeners directly. `manageUsersModal.js` also uses
  `onClose()` (returned by `openModal`) to clean up its own document-level
  "outside click" listener, since that listener would otherwise leak
  (re-added, never removed) every time the modal reopens.
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
- **The two export libraries (`docx`, `pdfmake`) and the spellcheck
  dictionary (`dictionary-en`) are excluded from the PWA's precache** via
  `vite.config.js`'s `workbox.globIgnores` — all large, only ever loaded on
  demand (Export/Export PDF clicked, or a form submitted), and needing a
  live Supabase fetch regardless of what's cached anyway, so there's no
  offline use case to precache any of them for.
- **Main view toolbar is a floating action button (FAB) cluster on
  mobile, a plain toolbar on desktop** — Add Record/Filter/Export are
  hidden by default behind a single bottom-right dots FAB on narrow
  screens (`mainView.js`); above 600px wide (`layout.css`'s own
  `@media (min-width: 601px)`, same breakpoint records.css's mobile
  overrides use), the identical markup becomes an always-visible row
  above the records list instead — CSS-only (`position: static`, hide the
  dots toggle, force the actions row always displayed), no JS branching
  needed, since `mainView.js` renders the cluster right before
  `#records-container` specifically so normal document flow already puts
  it in the right place once `position: fixed` is turned off. See
  SPEC.md "FAB cluster: toolbar on desktop, floating on mobile". Sign
  Out/Change Password/Manage Users are separately collapsed behind a
  header hamburger button on every screen size. Both reuse the same
  `setupToggle()` helper (open/close + close on outside click), itself a
  generalization of the row-menu (⋮) dropdown mechanics already used for
  per-row/per-user actions — see SPEC.md "2026-08-30 — main view toolbar
  redesign".
- **Maintenance/Operations toggle** (`mainView.js`'s `.view-toggle`) — a
  plain two-way switch between `recordsTable.js`'s maintenance view and
  `operationEventsTable.js`'s equivalent for operation events; both
  datasets are fetched by every `reload()` regardless of which is on
  screen, so switching is a pure re-render, no new fetch. See SPEC.md
  "maintenance/operations toggle view".
