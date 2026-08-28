# Handover — Project Spec & Decisions

Migrating an industrial work-permit / equipment-tracking tool from Google Apps
Script to Supabase + a static PWA. This file is the durable source of truth —
read this before re-deriving requirements from scratch in a future session.

## Tech stack

- **Frontend**: Vanilla JS + Vite, built as a PWA (installable on Android/iOS,
  app-shell cached for offline launch — see "Offline scope" below).
- **Backend**: Supabase (Postgres + Auth + RLS).
- **Auth**: Supabase Auth, magic link, restricted to an allowlist of ~10 known users.
- **Export**: Client-side `.docx` generation via the `docx` npm library. No PDF.
- **Hosting**: static site on Vercel or Netlify (free tier).

## Decisions made (2026-08-27)

| Question | Decision | Why / implication |
| --- | --- | --- |
| Frontend framework | **Vanilla JS + Vite** | No framework lock-in, smallest bundle, simplest PWA setup. Use `vite-plugin-pwa` for manifest + service worker instead of hand-rolling. |
| Offline scope | **App-shell caching only** | Service worker caches static assets so the app *launches* offline and shows last-loaded data. Reads/writes require connectivity. No IndexedDB write queue, no sync/conflict logic. |
| Edit/delete permissions | **Own records only** | RLS restricts UPDATE to rows where `created_by = auth.uid()`. Real DELETE is disabled entirely in favor of soft delete (see below), and the soft-delete "delete" action is implemented as an UPDATE, so the same own-records-only rule applies to it. **Known limitation**: one user cannot fix another user's mistake in the UI. If that becomes a problem, add an admin-override path later (e.g. a `security definer` RPC) rather than loosening RLS broadly. |
| Delete behavior | **Soft delete** | Rows get `deleted_at` set instead of being removed. Hidden from all client reads via RLS SELECT policy (`deleted_at IS NULL`). Recoverable only via direct DB/service-role access. Real `DELETE` is not granted to authenticated users. |

## Other assumptions (not asked, low-risk defaults — revisit if wrong)

- **Timezone**: no facility timezone specified. `start_date`/`end_date` are
  plain `date` columns (no timezone ambiguity). `operation_events.timestamp`
  and default "last 7 days" filter use the browser's local time. Revisit if
  the facility needs a fixed timezone regardless of the viewer's device.
- **Multi-line fields** (`detailed_steps`, `comment`): stored as plain text
  with `\n`-separated lines; each non-empty line renders as one bullet in the
  View modal and in the `.docx` export. No markdown, no rich text.
- **`last_updated`** (spec) is implemented as the `updated_at` column
  (auto-maintained by trigger) — not a separate duplicate column.
- **Reference data (systems/equipment) as tables, not enums**: `work_status`
  and `action` are true fixed vocabularies → Postgres enums. `systems` and
  `equipment` are more like configuration data the facility might extend
  (new generator installed, etc.) and Postgres enum types are awkward to
  alter (`ALTER TYPE ... ADD VALUE` can't run inside the same transaction as
  other DDL) — so these are normal lookup tables with a `sort_order` column
  instead. This also lets `systems` carry per-system flags
  (`operation_tracked`, `hide_when_empty`) instead of hardcoding system names
  in application logic.
- **Allowlist enforcement is two-layered**:
  1. In Supabase Auth settings, disable public sign-ups; pre-create the ~10
     users via the dashboard (Invite User) so magic link only ever works for
     existing accounts.
  2. An `allowed_users` table + `is_allowed_user()` SQL function, checked in
     every RLS policy — defense in depth in case sign-ups are ever
     accidentally re-enabled, and a single place to add/remove a user without
     touching Auth settings.
- **Business rules enforced at the DB layer (not just client-side)**:
  - `end_date` auto-fill/lock for `maintenance_records` (see schema.sql
    trigger) — enforced server-side so a buggy client can't violate it.
  - Derived equipment run/stop status is a SQL **view**
    (`equipment_status`), not a stored column — computed from event history
    per the spec. The Run/Stop/Trip/Swap *validation* rules ("reject Run if
    already Running", etc.) are left to the **application layer** for Phase
    1–3, reading from this view before insert. Consider hardening with a
    DB trigger later if the app layer proves insufficient (e.g. once a
    second client is added).

## Data model (as specified)

### Systems (fixed order)

1. PHVII GTG — equipment: GT-8040, GT-8050, GT-8060, Generic
2. Main Compressor — equipment: GT-1710A, GT-1710B, GT-1710C, GT-1710D, GT-1710E, Generic
3. Booster Compressor — equipment: GT-1050A, GT-1050B, Generic
4. Scarab GTG — equipment: GT-8000, GT-8010, GT-8030, Generic
5. Workshop — equipment: Generic
6. Others — equipment: Generic

Operation tracking applies **only** to PHVII GTG, Main Compressor, Booster
Compressor (and never to their "Generic" equipment entry).

Workshop / Others / Scarab GTG are the three systems that **hide entirely**
when they have zero records in view/export (all other systems always show
every equipment row, even with zero records).

### Table 1: `maintenance_records`

- id (uuid), start_date, end_date (nullable), system, equipment,
  work_scope (text), detailed_steps (text, multi-line/bulleted),
  work_status (enum), comment (text, multi-line), last_updated
- `work_status` options: Permit Prepared, Permit Submitted, Permit Discussed,
  Permit Ready to Open, Work in Progress, Work is Done, Job Canceled, Job
  Held, Other (free text)
- `end_date` auto-fills to today when status becomes one of the 3 terminal
  statuses (Work is Done / Job Canceled / Job Held), stays user-editable
  after that, but is locked/empty while status is non-terminal.

### Table 2: `operation_events`

- id (uuid), timestamp (user-editable, defaults to now), action, system,
  equipment, secondary_equipment (nullable), comment
- actions: Run, Stop, Trip, Run Test, Spin/Crank, Swap
- Status is **derived**, not stored: most recent Run→Running,
  Stop/Trip→Stopped, Swap→primary becomes Stopped + secondary becomes
  Running. Run Test / Spin / Crank are transient — they don't change
  persisted status.
- Validation: Run/Run Test/Spin/Crank rejected if equipment already Running.
  Stop/Trip rejected if already Stopped. Swap requires primary currently
  Running and secondary currently Stopped.
- All units start "Stopped" with no events.

## Frontend features (full scope, later phases)

- Main view: grouped System → Equipment, table of maintenance records per
  equipment (Start date, Scope, Status, Actions: View/Edit/Delete). Equipment
  always shown even with zero records, **except** Workshop/Others/Scarab GTG
  (hide entirely when empty).
- Tracked equipment shows "(Running)" in green when running.
- "History" button next to tracked equipment → modal listing all operation
  events for that unit, with Edit/Delete per event.
- "+ New Record" modal, Maintenance/Operation tab toggle:
  - Maintenance tab: full form as above.
  - Operation tab: Action → Timestamp → System → Equipment (filtered to
    valid units per the action's required state) → Secondary Equipment
    (only for Swap, filtered to Stopped units) → Comment.
- Date range filter (From/To, default last 7 days). Maintenance record shows
  if its date range overlaps the filter interval; operation events show if
  their date falls in range.
- Multi-line fields render as bullet lists in View modal.
- Export button: `.docx` for current filtered range — System banner (styled)
  → Equipment sub-header (styled, shows Running status) → combined
  chronological table of maintenance records + operation events, Swap events
  appear under **both** equipment involved. Systems with zero activity in the
  period are omitted entirely from the export.
- Auth: magic link login, allowlist-only via RLS.

## Companion docs

- [schema.sql](schema.sql) — proposed Postgres schema + RLS policies.
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — frontend folder layout.
- [PLAN.md](PLAN.md) — phased build plan, Phase 1 = minimal slice (auth +
  read-only display grouped by system/equipment).

None of this has been implemented yet — these are planning/reference
documents only, written ahead of time so future sessions don't need to
re-ask the same questions.
