# Handover — Project Spec & Decisions

Migrating an industrial work-permit / equipment-tracking tool from Google Apps
Script to Supabase + a static PWA. This file is the durable source of truth —
read this before re-deriving requirements from scratch in a future session.

## Tech stack

- **Frontend**: Vanilla JS + Vite, built as a PWA (installable on Android/iOS,
  app-shell cached for offline launch — see "Offline scope" below).
- **Backend**: Supabase (Postgres + Auth + RLS).
- **Auth**: Supabase Auth, email + password (see 2026-08-29 decisions below
  — this superseded the original magic-link plan), restricted to accounts
  the admin creates directly (no public sign-up).
- **Export**: Client-side `.docx` generation via the `docx` npm library, plus
  client-side `.pdf` generation via `pdfmake` (added 2026-08-30 — see
  "Decision (2026-08-30) — .pdf export added" below; originally spec'd as
  "no PDF").
- **Hosting**: static site on Vercel or Netlify (free tier).
- **Admin user management**: a Supabase Edge Function
  (`supabase/functions/admin-manage-users/`), used only for the two things
  that genuinely require the `service_role` key (creating an account,
  setting someone else's password) — see "2026-08-30 — user management"
  below. Deployed separately from migrations (`supabase functions deploy`),
  not via the GitHub integration.

## Decision (2026-10-22) — built-in technical dictionary

Asked how spellcheck decides a word is misspelled, which surfaced that
`dictionary-en` (general English) doesn't know practically any of the
industrial/rotating-equipment vocabulary this app's records are full of —
confirmed directly: thermocouple, RTD, PLC, HVAC, borescope, multimeter,
psig all came back unrecognized against the real dictionary.

Added `lib/technicalDictionary.js` — a baked-in `TECHNICAL_TERMS` list
(turbine/compressor/bearing-type rotating-equipment nouns, instrumentation
like thermocouple/borescope/multimeter, and common acronyms like RTD/PLC/
HVAC/SCADA/GTG) added to the speller unconditionally in `spellcheck.js`'s
`getSpeller()`, before the user's own "Add to Dictionary" words (see the
entry below) — works out of the box on a brand new device, rather than
needing every technical term taught by hand first.

Every entry is stored lowercase, including the acronyms — confirmed
directly that nspell/Hunspell's casing rules accept ANY casing of a
lowercase-added word (adding "rtd" passes "RTD", "Rtd", and "rtd" alike;
adding "kva" even passes mixed-case "kVA"), while the reverse doesn't hold
(adding "RTD" does NOT pass "rtd") — so lowercase is strictly the safer
choice regardless of how a given term is normally written.

Asked to prefer the hyphenated form ("re-calibrated") over the closed-up
one ("recalibrated") for words like this. No dictionary entry for the
closed-up form was needed at all, and none was added for the hyphenated
form either: `spellcheck.js`'s `WORD_PATTERN` only matches letter runs, so
a hyphen already splits "re-calibrated" into two separate words to check,
"re" and "calibrated" — and confirmed directly that both halves of every
"re-" form actually likely to show up (re-calibrated, re-aligned,
re-torqued, re-tightened, re-checked, re-installed) are already ordinary
English words `dictionary-en` recognizes on its own.

Verified end-to-end against the real `spellcheck.js` module (not a
reimplemented stand-in): a sentence mixing several technical terms, two
hyphenated "re-" forms, and two genuinely misspelled words ("Teh", "fien")
came back flagging only the two real misspellings.

## Decision (2026-10-21) — spellcheck: "Add to Dictionary" and "Skip all"

Extended the per-word spellcheck dialog (lib/spellcheckFlow.js) with two
more actions alongside the suggestion buttons and "Skip": "Add to
Dictionary" and "Skip all".

"Add to Dictionary" persists the word (lowercased) to `localStorage`
(`lib/spellcheck.js`'s `addToDictionary()`, key `handover-custom-dictionary`)
and adds it to the already-loaded `nspell` instance immediately, so it
stops being flagged for the rest of the current session too, not just
after a future reload — this device only, no backend of its own to sync
it through, same reasoning as the dictionary itself being a local Hunspell
dictionary rather than a hosted spellcheck API.

"Skip all" stops the entire spellcheck pass — not just the remaining
occurrences of the current word, but every other misspelled word in every
other field still left to check — leaving the rest of the text exactly as
typed. Distinct from the existing "Skip", which only dismisses the current
word (already applied to every occurrence of that one word, since the
flow prompts once per distinct word, not once per occurrence).

Verified directly against the real modules (Playwright, not a reimplemented
stand-in): typed two misspelled words, "Add to Dictionary" on the first and
a suggestion-click on the second, confirmed the first word was written to
`localStorage` and the resulting text was replaced correctly; ran a fresh
spellcheck pass containing the dictionary word again and confirmed no
dialog appeared and the text was returned unchanged; then ran a pass with
misspellings across two fields and confirmed clicking "Skip all" on the
very first word left both fields completely untouched.

## Decision (2026-10-21) — "Previous week" filter preset

Added a fourth quick-filter preset (filterModal.js) alongside Last 7 days/
Last 30 days/This month: "Previous week" — `lib/dateRange.js`'s
`getPreviousWeekRange()`. Unlike "Last 7 days" (a rolling window ending
today), this is the fixed calendar week before the current one, Monday
through Sunday (ISO week) — picked since the project had no prior
week-start convention on record; revisit if the user actually wants
Sunday-Saturday instead. Verified directly (not just reasoned through): ran
the function in Node across all seven days of a known week, confirming it
returns the same Mon–Sun range regardless of which day "today" falls on.

## Decision (2026-10-21) — bold text in multi-line fields

Asked to extend the multi-line field formatting toolbar (Indent/Outdent)
with bold text.

`lib/inlineFormatting.js`'s `parseInlineBold()` recognizes `**bold**`
markers (Markdown-style, but only that one marker — no italics, headings,
or links) and splits a line into `{ text, bold }` segments; one shared
parsing step, one rendering step per target:

- **`lib/bullets.js`** (View modal) — a bold segment becomes `<strong>`;
  escaping happens first, so a bold span's own text can't smuggle in a tag
  the escaping step didn't already neutralize.
- **`docxExport.js`** — one `TextRun` per segment, `bold` set per segment,
  instead of the single `TextRun` a bullet line used to be.
- **`pdfExport.js`** — a line with no markers stays a plain string (what a
  pdfmake list item already accepted); one with markers becomes
  `{ text: [...] }`, pdfmake's own format for mixed inline runs.

**Toolbar** (`lib/listFormatToolbar.js`) — a third button, Bold, toggles
`**` around the current selection: selecting text already wrapped exactly
in `**` removes the markers, selecting anything else adds them. With
nothing selected, it inserts an empty `**` pair and places the cursor
between them, ready to type. Ctrl+B (Cmd+B on Mac) inside the field does
the same thing, alongside the existing Tab/Shift+Tab for indent — scoped
to the field itself, so it doesn't collide with `mainView.js`'s own global
N/F/O/P shortcuts (those already skip themselves whenever focus is in a
text field). Deliberately simple, not a full rich-text selection model: it
toggles the exact selection, not whatever bold span might surround it —
reselecting a sub-range of an already-bold span and clicking Bold wraps a
second, nested pair rather than detecting and adjusting the outer one.

**`lib/textCase.js`'s `capitalizeWord()` needed a fix to coexist with
this**: it used to capitalize literally the first character
(`.charAt(0).toUpperCase()`), which is a silent no-op on `*` — a line
starting with a bold marker ("**important** check this") would never get
capitalized at all. Changed to capitalize the first LETTER instead
(`.replace(/[a-zA-Z]/, ...)`, which only touches the first match),
correctly skipping past any leading markers.

Verified directly: in a real browser, selecting text and clicking Bold
wraps it, clicking Bold again on that exact selection unwraps it, clicking
with nothing selected inserts an empty pair with the cursor correctly
positioned between the markers, and Ctrl+B does the same as the button.
Ran a bold-marked field through the full submit pipeline (case
normalization, then the real View modal) and confirmed the markers survive
capitalization and render as genuine `<strong>` text. For the exports:
unzipped a real generated `.docx` and inspected `word/document.xml`
directly — confirmed the non-bold and bold runs carry `<w:b w:val="false"/>`
and `<w:b/>` respectively, not just that the file built; and rendered a
real generated `.pdf` to an actual image (`pdftoppm`) and visually
confirmed the bold words appear genuinely bold alongside plain text in the
same sentence, including inside a nested (indented) bullet.

**Follow-up (2026-10-21)** — live bold/bullet rendering in the editor.
Asked for bold (and then bullets) to render as they'll actually look while
typing, not as literal `**markers**`/tabs. A plain `<textarea>` can't do
this at all — it only ever shows uniform plain text — so this replaces it
with `lib/richTextField.js`: a `contenteditable` region where each line is
its own `.rich-line` div, `data-depth` driving both a live bullet glyph
and the indent via CSS (records.css — same •/◦/▪-every-3-levels scheme the
exports already use), and bold runs are real `<strong>` elements. Flagged
first that this is a genuinely bigger rewrite than anything else in this
feature, with more edge-case risk (cursor handling, paste, cross-browser
quirks) than a plain textarea — confirmed before starting.

`lib/listFormatToolbar.js` was rewritten to match: Indent/Outdent now
walk whichever `.rich-line`s the current selection touches and adjust
their `data-depth`, and Bold now calls the browser's own
`document.execCommand('bold')` rather than hand-rolling the Range surgery
a correct toggle needs (splitting a partially-bold selection, merging
adjacent bold runs) — deprecated as a spec, still universally supported
for exactly this kind of simple boolean toggle. Enter, Backspace-at-a-
line's-start, and paste are all handled by hand (`richTextField.js`)
rather than trusted to the browser's own inconsistent contenteditable
defaults — new lines inherit the current line's depth (continuing a
nested bullet keeps its indent until explicitly outdented), Backspace at
a line's start merges it into the previous line rather than letting the
browser's cross-block-boundary handling risk corrupting the `.rich-line`
structure it doesn't know about, and paste is forced to plain text
(stripping whatever formatting a pasted Word doc/web page would otherwise
bring in, since this editor has no model for anything beyond depth+bold).
Known, accepted limitation: a selection spanning multiple lines being
deleted or typed over isn't specially handled — left to the browser's
default behavior, which usually still works reasonably but isn't
hardened the way the single-line cases are.

Two real bugs surfaced during verification, both now fixed:

- **Clicking the field didn't focus it at all.** A `<label>` containing a
  `<button>` forwards every click anywhere inside it to that button —
  standard (if obscure) browser label semantics: a label with multiple
  labelable children just picks one to always activate — not specific to
  this code, but it made every field broken for the small reason that its
  own toolbar's buttons live in the same label. Worked around in
  `attachListFormatToolbar()`: intercepts the label's own click, before
  the browser's default forwarding runs, and sends focus to the actual
  field instead unless the click was genuinely on a toolbar button.
- **A line produced by splitting right at the end of its text (the
  ordinary case for pressing Enter at a line's end) could end up invisible
  and uneditable.** `Range.extractContents()` leaves an empty text node —
  or, splitting right after a bold run, an empty `<strong>`/`<b>` — behind
  as a boundary artifact even when nothing was actually extracted; the
  code checking whether a line needed its placeholder `<br>` only checked
  for zero children or exactly one `<br>`, missing both cases, so some
  freshly-split lines never got one. Fixed by making that check recursive
  (`hasVisibleContent()`): an element only counts as content if one of
  its own children does, so an empty nested element no longer reads as
  "this line already has something in it."

Verified directly, not just reasoned about — both of the above were found
by testing in a real browser, not predicted in advance: typing text,
pressing Enter repeatedly, Tab/Shift+Tab to indent/outdent, Ctrl+B and the
toolbar's Bold button, and Backspace merging a line into the previous one,
all through real clicks and real keystrokes. Then the full pipeline
end-to-end through the actual `recordModal.js` form: typed a nested,
bolded field through the real UI, submitted it (case normalization,
spellcheck), opened the real View modal and confirmed correct nested
`<strong>` rendering, then re-rendered the same form in Edit mode with the
saved record and confirmed the field correctly re-populates with matching
depth/text/bold — a full round-trip through actual Edit, not just the
underlying get/set functions in isolation.

## Decision (2026-10-19) — remove the History button

Asked, conditionally: now that the Operations view shows the same
row-level data and the same row-menu options (View/Edit/Delete/Manage
Access) as the per-equipment History modal, is it sufficient to replace
it? Flagged one real behavioral difference first — History showed
ALL-TIME events for one equipment, filter-independent, while Operations
view is scoped to the main Filter dialog's current date range — then
removed it on confirmation that this tradeoff is acceptable. Seeing an
equipment's full history going forward means switching to Operations view
and widening the date filter to cover all time, rather than a dedicated
button.

Removed: the "History" button next to a tracked equipment's name, in both
`recordsTable.js` (maintenance view) and `operationEventsTable.js`
(Operations view); `historyModal.js` itself (`openHistoryModal()`, its own
realtime subscription, and its own "Show deleted" toggle — Operations view
already shares the main Filter dialog's own one); the `.history-button`
CSS (now unused); and the `data-action === 'history'` branch in
`mainView.js`'s click delegation.

`historyModal.js` had three exports genuinely reused elsewhere
(`operationActionLabel()`, `operationActionDescription()`,
`openViewOperationEventModal()`) — moved as-is into a new
`operationEventDisplay.js` rather than deleted, since
`operationEventsTable.js` and `mainView.js` both still need them and
neither should duplicate what used to live in the now-gone modal.

Verified directly: both views' equipment headers show the Running tag but
no History button; a build succeeds (no dangling imports of the deleted
file); and the Operations view's row menu still fully works end-to-end
(View/Edit/Delete/Manage Access) through the relocated
`operationEventDisplay.js` functions.

## Decision (2026-10-18) — filter persists across refresh

Asked whether the current filter survives a page refresh — it didn't:
`currentRange`/`currentSearch`/`includeDeleted`/`currentView` were all
plain in-memory variables in `mainView.js`, reset to their hardcoded
defaults (`getDefaultRange()`'s last 7 days, empty search, deleted hidden,
Maintenance view) every time the view re-mounts, with nothing anywhere in
the app reading or writing `localStorage` before this.

`lib/filterPersistence.js` now saves `{ from, to, search, includeDeleted,
view }` as one JSON blob under `localStorage['handover-filter']`, written
whenever the Filter dialog's Apply is used or the Maintenance/Operations
toggle is clicked, and read once at `mainView.js` mount to seed those same
four variables (falling back to the normal defaults if nothing's saved,
or if what's saved doesn't parse into the expected shape — covers both
"never saved" and "saved by a since-changed version of this app" with the
same fallback, rather than needing a schema migration). Plain
`localStorage`, not scoped per-user: this is "what this browser was last
looking at," the same category of thing as a scroll position, not account
state — Supabase Auth's own session storage is untouched.

Persists the literal date range chosen, not which preset (if any)
produced it — picking "Last 7 days" today and coming back tomorrow
restores yesterday's exact dates, not a freshly-recomputed "last 7 days
from now." Simplest option, and arguably still correct: the dates
themselves are what the person was intentionally looking at.

Verified directly: set a distinctive custom range/search/"show deleted"/
Operations view through the real UI, confirmed the exact JSON landed in
`localStorage`, then did an actual `page.reload()` (not a fresh re-render)
and confirmed every one of the four values came back — the active toggle
button, and the Filter dialog's own fields when reopened. Separately
confirmed a browser with nothing saved still gets the normal defaults
untouched.

**Follow-up (2026-10-19)** — asked for a refinement: a refresh should keep
the filter (as above), but a brand new tab should start on the normal
defaults, not silently inherit whatever filter another tab last left
behind. Switched the one line that mattered — `localStorage` to
`sessionStorage` in `lib/filterPersistence.js` — rather than adding new
logic to distinguish the two cases: `sessionStorage` already survives a
same-tab reload but starts empty in a freshly opened tab (even to the
same URL), which is exactly the "refresh keeps it, new tab doesn't" split
asked for, for free. Verified directly: tab A's custom filter survived a
real `page.reload()`, while a second tab opened fresh in the same browser
context came up on the normal defaults.

## Decision (2026-10-18) — Pending field, simple formatting, case rules, spellcheck, operations toggle

Six independent features landed together.

**`pending` field** (`maintenance_records.pending`, migration
`20261018000000_add_pending_field.sql`) — optional free-text, same
\n-separated-lines-as-bullets convention as `detailed_steps`/`comment`,
shown in the form, the View modal, and both exports right after Comments.
No trigger/RLS changes — nullable, no default, not involved in any
business rule.

**Simple list formatting** (`lib/listFormatToolbar.js`) — a small
Indent/Outdent toolbar above every multi-line field (`detailed_steps`,
`comment`, `pending`, and operation events' own `comment`), plus Tab/
Shift+Tab inside the field itself doing the same thing. A line's leading
tab characters set its nesting depth; `lib/bullets.js` (the View modal)
renders that as a real nested `<ul>`/`<li>` tree, and `docxExport.js`/
`pdfExport.js` render it as nested Word list levels / pdfmake's own nested
`ul` respectively. Backward compatible by construction, not by a special
case: existing data has no leading tabs, so it all renders as the same
flat depth-0 list it always did.

Deliberately NOT a toggleable "make this line a bullet / not a bullet"
control — every line in these fields has always been treated as a bullet
(existing stored data has no per-line marker to say otherwise), so adding
an explicit "plain paragraph" line type would need a new marker and would
silently reinterpret every already-saved record. Indentation alone is
purely additive.

**Title case / sentence case on submit** (`lib/textCase.js`) —
`work_scope` gets full title case (`toTitleCase()`, small words like
"the"/"of"/"and" stay lowercase unless first/last word); every other
multi-line field gets sentence case (`capitalizeLines()`: capitalizes the
first letter of each non-empty line, i.e. each bullet point, preserving
any leading indentation tabs). Applied once, at submit time — not live as
the user types, so text never jumps around under their cursor mid-edit.

**Spellcheck on submit** (`lib/spellcheck.js`, `lib/spellcheckFlow.js`) —
on submit (after case normalization), every word in `work_scope`,
`detailed_steps`, `comment`, and `pending` (or just `comment`, for an
operation event) is checked against a real Hunspell dictionary
(`nspell` + `dictionary-en`, both pure JS/data with zero network
dependency — same "no backend of this app's own to call from" reasoning
as the work-scope autocomplete decision, not a hosted/paid spellcheck
API). Every misspelled word gets its own dialog, one at a time, with up to
6 suggestions to pick from or a Skip button, looping until every
misspelling across every field has been resolved one way or the other
before the record actually saves.

`dictionary-en`'s own package.json only exports `./index.js` — a
Node-only loader (`fs.readFile` + `import.meta.url`) that doesn't work in
a browser bundle at all — so its `.aff`/`.dic` data files are pulled in
directly as text via Vite's `?raw` import instead
(`/node_modules/dictionary-en/index.{aff,dic}?raw`, an absolute path
rather than the bare package specifier, since the exports restriction
only blocks the latter), bypassing that loader entirely. Both the
dictionary (~550KB) and `spellcheck.js` itself are lazy-loaded (dynamic
`import()`, triggered from the submit handlers) and excluded from the
PWA's precache (`vite.config.js`'s `workbox.globIgnores`) — same reasoning
as `docx`/`pdfmake` already got: large, on-demand only, and a submit
needs a live Supabase write regardless of what's cached.

**Maintenance/Operations toggle** (`mainView.js`'s `.view-toggle`,
`operationEventsTable.js`) — a plain two-way switch on the main view
between the existing maintenance-records table and a new, equivalent
top-level table of operation events (grouped by System/Equipment exactly
like maintenance records, instead of scoped to one unit's full history
the way the existing History modal is — that stays too, as the
full-history/admin-restore view). Both datasets are fetched by every
`reload()` regardless of which is on screen, so toggling is a pure
re-render against already-loaded state, not a new fetch; the "+ Add"
button's New Record modal opens on whichever tab matches the view
currently showing. `operationEventsTable.js` reuses `historyModal.js`'s
`operationActionLabel()` (short table-preview form) and
`openViewOperationEventModal()`/`operationActionDescription()` (the View
modal's full descriptive sentence) directly rather than duplicating them —
unlike `docxExport.js`/`pdfExport.js`'s own independent copies, this is
the exact same table-preview/View-modal context, not a different
rendering target. `operation_event_access` was added to `mainView.js`'s
realtime subscription list alongside the existing
`maintenance_record_access`, so a just-granted user's Edit/Delete lights
up live in the new view too.

Known limitation: the Filter dialog's text search only ever searched
`work_scope`/`detailed_steps`/`comment` on maintenance records
(`fetchMaintenanceRecords`) — it does not search operation events' own
comments, so switching to the Operations view with an active search term
currently just shows the full unfiltered list. Not addressed here; worth
revisiting if it turns out to matter in practice.

Verified directly, not just reasoned about: a temporary harness mounted
the real `recordModal.js`/`operationEventModal.js` forms and `mainView.js`
itself (data calls stubbed, restored via backup/`git checkout` right
after each pass) — confirmed the Pending field saves and displays, Indent/
Outdent produces correctly nested bullets (web View modal, and inspected
via real generated `.docx` XML and `pdftotext` on a real generated `.pdf`
for the nesting), title/sentence case apply exactly as specified including
the small-words exceptions, the spellcheck dialog loop correctly applies a
chosen suggestion and leaves a skipped word untouched across two
consecutive misspellings, and the toggle correctly switches rendered
content, routes row-menu actions (view/edit/delete, confirmed via the
real undo-toast appearing) to the right data set, and opens "+ Add" on the
matching tab.

**Follow-up (2026-10-18)** — operation view: match History's row layout.
The Operations table was missing the "By" (creator) column History's own
table has — its row-menu options already matched exactly (View/Edit/
Delete/Manage Access, Restore/Delete forever when deleted), but the
visible columns didn't (Timestamp/Action/Comment/actions vs History's
Timestamp/Action/**By**/Comment/actions). Added it:
`renderOperationSystemsHTML()` now takes `profileNames` (mainView.js
already had it in `state`, from the same `fetchProfileNames()` call the
maintenance view uses) and threads it down to each row, same
`profileNames.get(event.created_by) ?? '—'` lookup History's own table
uses. Verified in a real browser: the column headers now read Timestamp/
Action/By/Comment (plus the actions column), and a row for an event
created by a stubbed "Bob" correctly shows "Bob" in that column.

**Follow-up (2026-10-19)** — `toTitleCase()` had a real bug: it lowercased
the entire word first, then re-capitalized just the first letter, which
silently destroyed any deliberate capitalization elsewhere in the word —
"GT-8040" became "Gt-8040," "ASAP" became "Asap." Asked explicitly never
to force a character the user actually typed as a capital back down to
lowercase, since abbreviations are common in this kind of text.
`capitalizeLines()` already only ever touched a line's first character
(never lowering anything), so it didn't need a change; `toTitleCase()` now
does the same — capitalizes a word's first letter if it isn't already,
leaves every other character exactly as typed. Verified: `"GT-8040
inspection"` now stays `"GT-8040 Inspection"`, and `"check ASAP for
GT-8040"` stays `"Check ASAP for GT-8040"`, while plain lowercase input
still title-cases normally.

## Decision (2026-10-18) — maintenance record dialog: desktop layout

Asked to shrink the Maintenance Record dialog's height on desktop enough
that it doesn't need scrolling, given the Pending field above just added a
fourth stacked textarea on top of an already-tall form.

- **Wider dialog** — `openMaintenanceRecordModal` (standalone Edit) and
  `openNewRecordModal` (its Maintenance tab) both moved from their
  previous widths (520px default, 600px `medium`) to `{ wide: true }`
  (720px) — the same tier `historyModal.js`'s table already uses. More
  horizontal room is what makes the two pairings below worth doing instead
  of looking cramped.
- **System + Equipment, and Work status + Other status, paired on one row
  each** — a new `.form-row--stack-mobile` modifier on the existing
  `.form-row` (already used for Start/End date): row on desktop, stacked
  on mobile. A plain `.form-row` (Start/End date's own class, left
  unchanged) is always a row regardless of width — fine for two narrow
  date inputs, but two `<select>`s (or a select + free-text input) side by
  side read as cramped on a narrow phone screen the way two dates don't,
  so these two pairs specifically get the mobile-stacking behavior Start/
  End date doesn't need.
- **Indent/Outdent toolbar moved onto the same line as its field's label**
  (`detailed_steps`/`comment`/`pending`) — the label text is now wrapped
  in a `<span class="field-label-row">`, and `lib/listFormatToolbar.js`
  appends the toolbar into that span (instead of inserting it as a
  separate line above the textarea) whenever it finds one. CSS alone
  decides the rest: stacked (text, then toolbar) on mobile, same row with
  the toolbar pushed to the far right via `justify-content: space-between`
  on desktop. Falls back to the original "insert before the textarea"
  behavior for any field without that wrapper — operationEventModal.js's
  own comment field wasn't changed (out of scope: this request was about
  the maintenance record dialog specifically), so it still gets the
  toolbar-on-its-own-line treatment, unaffected.

Verified directly in a real browser, both breakpoints: confirmed desktop
(1280px) actually pairs System/Equipment and Work status/Other status on
one row each (including re-checking after switching status to "Other",
since that's the one case where the second field in the pair goes from
hidden to visible), that the Indent/Outdent toolbar sits on the same row
as "Detailed steps"'s label text, and that the modal is 720px wide; then
confirmed mobile (390px) stacks both pairs and puts the toolbar back below
the label text — same markup, pure CSS doing the switching.

**Follow-up (2026-10-18)** — all three changes above were desktop-only by
design (System/Equipment and Work status/Other status fell back to
stacked on mobile; the toolbar fell back to its own line above the
textarea). Asked, immediately after, to drop that mobile exception and
keep all three on every screen size instead. Removed the now-unneeded
`.form-row--stack-mobile` modifier (System/Equipment and Work status/
Other status just use plain `.form-row`, same as Start/End date already
did) and `.field-label-row`'s mobile-vs-desktop media query (it's just
always a row now). The dialog's own width stays responsive as before —
`.modal`'s `width: 100%` already fills a narrow viewport regardless of its
`max-width` cap, so these pairings simply get tighter on a small phone
screen rather than needing their own breakpoint logic; `.form-row > label`
already had `min-width: 0` from the original Start/End date pairing, which
is what keeps a long equipment/system name eliding instead of overflowing
at that width.

Verified directly at 375px width (narrower than the two breakpoints
checked above): System/Equipment, and Work status/Other status (again
re-checked with "Other" selected), both still land on one row each, and
the Indent/Outdent toolbar still sits on the same row as its field's
label text. One minor, accepted cosmetic side effect at this width: "Other
status (free text)" is long enough to wrap onto two lines, which nudges
its input a little lower than "Work status"'s dropdown in the same row —
the two fields are still correctly paired (confirmed via their parent
`<label>`s sharing an identical bounding box), just not pixel-perfectly
top-aligned to each other at the narrowest end of normal phone widths.

## Fix (2026-10-08) — row-menu hidden behind the desktop sticky toolbar

Reported: opening a row's ⋮ menu on desktop could hide some or all of its
options. Root cause: `.row-menu__dropdown` (records.css) had `z-index: 10`
from before the desktop toolbar existed — fine against plain table rows,
but the desktop toolbar (`.fab-cluster`, see the FAB cluster decision
below) became `position: sticky` with a solid background at `z-index: 40`,
so any dropdown overlapping that bar's rectangle rendered behind it
instead of on top. Two distinct ways this happens: a row scrolled to sit
right at the sticky bar's edge, and — the case actually reproduced below —
`lib/dropdownPosition.js` flipping a dropdown to open *upward*
(`positionDropdownToFit`, for a row with more room above than below) on a
short enough viewport that the upward-opening menu's top lands inside the
toolbar's 0–68px band. Fixed by raising `.row-menu__dropdown` to
`z-index: 50`, above the toolbar, still below modals (100) and
toasts (150/200).

Verified by reproducing the exact failure, not just reasoning about the
numbers: a temporary harness mounted the real `mainView.js` (data calls
stubbed, restored via `git checkout` right after) with enough synthetic
equipment to make the list scroll, at a short viewport height chosen so a
row's dropdown flipped upward into the toolbar's band. With the old
`z-index: 10`, `document.elementFromPoint()` at a point inside the
dropdown's own rectangle returned the toolbar's PDF button, not the
dropdown's — confirming the menu really was unclickable there. With
`z-index: 50`, the same point correctly returned the dropdown's own View
button.

## Decision (2026-10-18) — FAB cluster: toolbar on desktop, floating on mobile

The bottom-right floating dots button (Add Record/Filter/Export Word/
Export PDF) was asked to stay for "mobile phones and small screens" but
become a plain, always-visible toolbar row above the records list on
desktop — not hidden behind a toggle there at all, since there's no space
constraint to justify it.

Implemented as CSS-only, reusing the exact same markup/JS rather than
rendering two different button sets: `mainView.js` moved `.fab-cluster`'s
markup to right before `#records-container` (it used to come after) —
harmless on mobile, since `position: fixed` takes it out of normal flow
regardless of DOM position, but it means flipping to `position: static`
at `min-width: 601px` (same breakpoint `records.css`'s own mobile-only
table overrides use) makes it land in exactly the right place in normal
document flow, with no flexbox-reordering trick needed. At that
breakpoint: the dots toggle itself is hidden (nothing to toggle once
everything's always shown), and `.fab-actions` is forced visible
regardless of its `hidden` attribute's actual state via a
class+attribute selector (`.fab-actions[hidden]`) — the same
already-tested specificity trick as `.row-menu__dropdown:not([hidden])`
(records.css), beating the UA stylesheet's `[hidden] { display: none }`
without reaching for `!important`. The existing `setupToggle()` JS
(open/close, close-on-outside-click) needed zero changes — it still runs
on desktop, it just never visibly matters there, since the CSS override
makes the actions row display regardless of what that logic sets the
`hidden` attribute to.

**Follow-up (2026-10-06)** — three refinements to the desktop toolbar:

- **Rectangular, gently rounded** (`border-radius: 4px`, matching
  `base.css`'s plain `button` rule) instead of circular — a circular FAB
  reads fine floating on mobile, but looks odd as a static full-width
  toolbar button.
- **Fills the full width** — `.fab-actions` (and each `.fab--sub` inside
  it) now `flex: 1` instead of a fixed small size, so the four buttons
  evenly divide the whole row rather than clustering to one side.
- **`position: sticky` instead of `position: static`** — stays pinned at
  the top of the viewport while the records list scrolls underneath it,
  rather than scrolling away with the page. Sticky rather than fixed on
  purpose: it stays in normal flow (right below the header) until
  scrolling would carry it past the top of the viewport, so it never
  needs to know the header's height to avoid overlapping it the way a
  `position: fixed` pinned from the very start would.

Verified directly in a real browser (not just reasoning about the CSS) —
served the actual page through the dev server, screenshotted at the top
of a long scrollable list (toolbar in its normal in-flow position) and
after scrolling well past it (toolbar correctly pinned at the viewport
top, solid background, content scrolling underneath it) — before
considering this done.

**Follow-up (2026-10-06)** — keyboard shortcuts for the four actions:
`N` (Add Record), `F` (Filter), `W` (Export Word), `P` (Export PDF). A
single `keydown` listener in `mainView.js` maps the bare (no Ctrl/Cmd/Alt)
key to the matching button and clicks it — reusing the existing click
handlers rather than duplicating their logic. Suppressed whenever focus is
in an input/textarea/select/contenteditable (so normal typing elsewhere in
the app isn't hijacked) or whenever a modal is already open
(`.modal-overlay` present), and ignored entirely if any modifier key is
held, so e.g. the browser's own Ctrl+F still works untouched. The hint is
surfaced via each button's existing `title` tooltip (e.g. "Add record
(N)") rather than a separate help UI. Cleaned up via the same mechanism as
the live-sync subscription — bundled into the function `renderMainView`
returns, which `main.js` already calls before mounting a fresh view — so
re-mounting the view (a real sign-in/out) can't double-register the
listener.

Verified against the real code paths, not a copy of the logic: a temporary
harness page mounted the actual `renderMainView` (with a fake session, so
Supabase calls harmlessly fail/no-op) and drove it with real keyboard
events — confirmed `N`/`F` open the right modal, a second shortcut
press while a modal is already open adds no second overlay, typing `n`
into a text field does nothing but type, `Ctrl+F` is a no-op, and `W`/`P`
each produce a real file download.

## Fix (2026-10-08) — W shortcut silently did nothing

Reported: pressing W never triggered the Word export, while N/F/P all
worked. Root cause: the shortcut map was keyed on `event.key` — the
*character* a keypress produces, which is keyboard-layout-dependent (e.g.
AZERTY swaps the physical W/Z keys relative to QWERTY). On a mismatched
OS-layout/physical-keyboard combo, pressing the key labeled "W" can report
a different character entirely, so it simply never matched anything in
`SHORTCUT_KEYS` — direct clicks on the button were unaffected since they
don't involve a keyboard character at all, which is why only this one
shortcut broke while the others (whose letters don't move in that swap)
kept working fine. Fixed by keying `SHORTCUT_KEYS` on `event.code` instead
— the *physical key position*, layout-independent, which is what the
printed "(W)" hint actually refers to.

Verified by reproducing the exact failure: in the same harness as above,
dispatched a raw `KeyboardEvent` with `code: 'KeyW'` but `key: 'z'`
(simulating the AZERTY mismatch) — with the old `event.key`-keyed lookup
this produced no download at all (confirming it reproduces the report
exactly), and with the `event.code` fix it correctly triggers the Word
export; re-confirmed N/F/P still work unchanged.

**Follow-up (2026-10-08)** — W still didn't work even after the
`event.code` fix above, and neither did a first attempt switching it to D.
The user confirmed what was actually going on: pressing W, A, S, *or* D
anywhere on their machine (not just this app) pops up an on-screen counter
that increments/decrements/toggles — their Ubuntu install has something
(most likely a key-remapping/accessibility tool) globally bound to the
whole WASD cluster, swallowing the keypress at the OS level before it ever
reaches the browser. No code change here can work around an OS-level
interception; the actual fix is just picking a letter outside that
cluster. Export Word's shortcut is now **O** (second letter of "wOrd").
Verified in the harness: O triggers the `.docx` download, and N/F/P are
unaffected. (W and D are both correctly inert now — neither has an entry
in `SHORTCUT_KEYS` — though that's moot for this user either way, since
their OS claims those keys before the page ever sees them.)

## Decision (2026-10-15) — stale-record flagging, self-undo, date presets

Three smaller, independent features landed together.

**Stale-record flagging** (`lib/staleness.js`) — a maintenance record is
"stale" when it's sat in a non-terminal status without an update past
that status's own threshold: 4 days for the pre-work "permit" stages
(Prepared/Submitted/Discussed/Ready to Open), 7 days for Work in
Progress. Terminal statuses and "Other" are never flagged — there's no
"stale" concept for a closed or free-text-catch-all record. Two parts:

- A persistent `⚠ Stale` tag next to the status in the records table,
  recomputed on every render (so it just naturally stays current, no
  separate tracking needed) — visible to anyone who can see the record.
- A one-time-per-session popup (`staleRecordsModal.js`) listing stale
  records the CURRENT user can actually act on (admin: every stale
  record; a regular user: their own, or one they've been granted access
  to), each with a direct "Edit" button. Deliberately gated to fire once
  per `renderMainView()` call, not on every `reload()` — reload() now
  fires constantly (live sync, every action, the user's own edits), and
  re-popping the same dialog on every one of those would be a real
  regression, not a feature. Checked against real current data before
  shipping: nothing in the live DB is stale yet (closest is 3 days, one
  day under the 4-day threshold) — so this won't visibly do anything
  immediately, which is correct, not a sign it's broken.
- Added a `--warning` color token (`variables.css`, light + dark) — the
  existing palette only had `--success`/`--error`, nothing in between.

**Self-service undo after delete** — the record's own creator can now
undo their OWN just-performed soft-delete, via a short "Undo" toast
(`lib/undoToast.js`) with a visible countdown, for both maintenance
records and operation events. This needed a DB change: `restore_*`'s own
server-side check gained a second condition alongside `is_admin()` —
`created_by = auth.uid() AND deleted_at > now() - interval '20 seconds'`
— deliberately time-boxed via `deleted_at` itself, not a standing
"creator can always restore" permission. The point is covering the
common accidental-click case cheaply, not reopening who gets to decide
what comes back after a delete in general — that stays admin-only beyond
the window, unchanged. The toast is only ever shown to someone the RPC
will actually let succeed (admin, or the creator) — someone who merely
has granted edit access doesn't get a toast that would just fail if
clicked. Verified directly against the live DB in one rolled-back
transaction: a fresh delete's undo succeeds for the creator, the same
delete 30s later (past the window) is rejected, and a third, uninvolved
user is rejected regardless of timing.

**Date-range presets** (`lib/dateRange.js`, `filterModal.js`) — "Last 7
days" / "Last 30 days" / "This month" buttons that just fill the From/To
inputs rather than auto-submitting, since someone picking a preset might
still want to add a search term or toggle Show Deleted before applying.

## Decision (2026-10-12) — "Other" status: optional end date

Work status "Other" now gets an optional end date — set it if the work
actually concluded, or leave it empty for "still ongoing," same semantics
as the three genuine terminal statuses (Work is Done/Job Canceled/Job
Held) minus the auto-fill. Needed a DB change, not just a UI one: the
`maintenance_record_biu` trigger previously force-nulled `end_date` on
*every* write for any non-terminal status, "Other" included, regardless
of what the client sent — a client-only fix would've been silently undone
server-side on every save. Added a third branch (terminal / "Other" /
everything else) — "Other" passes the client's `end_date` through
untouched (no auto-fill like a terminal status, no forced null like every
other non-terminal status). The three genuinely "in progress" statuses
(Permit Prepared/Submitted/Discussed/Ready to Open, Work in Progress)
still have no end-date concept at all — only "Other" changed.

Verified directly against the live DB (not just reasoning about the SQL):
a real transaction, rolled back after, covering all four cases — "Other"
with an explicit end date (kept), "Other" with none (stays null, not
auto-filled), and two regression checks confirming unrelated statuses are
unaffected — Work in Progress still force-nulls an end date even if one
is sent, and a terminal status still auto-fills when left empty.

## Decision (2026-10-05) — autocomplete from history, not a generative model

Asked for: "auto-suggest completion... based on previous records data,"
explicitly as "some simple free AI model." Given this app has no backend
of its own (static PWA + Supabase only) and no budget/infra for a hosted
model or API key, the responsible match for "simple" and "free" is a
data-driven autocomplete against this project's OWN historical data — not
a generative/LLM-style completion engine, which would need an external
paid API this architecture has nowhere to call from.

- `work_scope` only (a single-line `<input>`) — `detailed_steps`/`comment`
  are multi-line `<textarea>`s, which the native HTML `<datalist>` this
  uses doesn't support (it suggests a whole-field value, not a
  per-line/partial completion). Scoping to the one field that's actually
  a good fit beats a half-working version across all three.
- `fetchPriorWorkScopes()` (`data/maintenanceRecords.js`): distinct prior
  `work_scope` values for THIS SPECIFIC equipment (not the whole system or
  every record globally) — recurring maintenance on a given unit tends to
  repeat near-identical wording ("Weekly PM", "Borescope Inspection", ...
  confirmed against real seeded data, not a hypothetical). Visible across
  every user's records, not just the caller's own —
  `maintenance_records_select` has no `created_by` restriction (unlike
  the update policy), and the point here is "what's commonly written for
  this unit," not "what I personally wrote before."
- Refetched whenever the Equipment dropdown changes (a new listener —
  there wasn't one before; only System had one, to repopulate Equipment's
  options) and once more on initial load, covering the Edit case where
  equipment is pre-filled. Guarded against out-of-order responses (a
  request-id counter) since switching equipment quickly fires several
  overlapping fetches.

**Follow-up (2026-10-08)** — rescoped to the whole **system**, not just
the one equipment being edited: `fetchPriorWorkScopes()` now filters on
`system_id` instead of `equipment_id`, and the refetch trigger moved from
the Equipment dropdown to the System dropdown (switching equipment within
the same system no longer refetches — same list either way, since it's no
longer equipment-specific). Verified against the real code path (a fake
`supabase` query-builder recording the `.eq()` calls `renderMaintenanceForm`
actually makes): selecting a system shows that system's combined
suggestions, switching equipment within it doesn't trigger a second fetch,
and switching system does.

## Fix (2026-10-06) — Swap direction in History/exports was unclear

The History table and both exports labeled a Swap event with just an
arrow (`Swap → Pump B` / `Swap ← Pump A`), relying on the reader to infer
that `→` meant "this one stopped, that one started" — confusing without
already knowing the convention. Changed to spell it out: `Swap out →
Pump B` (this equipment stopped, Pump B started in its place) and `Swap
in ← Pump A` (this equipment started, replacing Pump A). Same
`operationActionLabel()` logic duplicated in `historyModal.js`,
`docxExport.js`, and `pdfExport.js` (one per rendering target); updated
all three. Verified the exported `.docx`'s actual XML content (not just
that it built) shows both label variants correctly.

**Follow-up (2026-10-06)** — split into a short table-preview form and a
descriptive full-sentence form, rather than one label doing both jobs:

- **History table's Action column** — back to short: `Swap - Pump B`,
  same text either direction (the stopped/started distinction is now only
  one click away, not crowding the row).
- **History's View modal** (`openViewOperationEventModal`) — full
  sentence instead: "This equipment stopped; Pump B took over." (or "...
  took over; Pump A stopped." on the other equipment's history), via a
  new `operationActionDescription()` alongside the now-short
  `operationActionLabel()` in `historyModal.js`.
- **`docxExport.js`/`pdfExport.js`** — kept the full sentence, not the
  short form: a printed document has no "View" modal to drill into for
  more detail the way the table does, so the export's one line of text
  needs to already be the complete, self-contained version.

Verified against the real rendered output, not just the string-building
logic: a temporary harness mounted the actual `openHistoryModal` (data
calls stubbed in place, restored via `git checkout` right after) and
confirmed both the table's short label and the View modal's full sentence
for both equipment's perspectives; the exports were re-verified the same
way as above (real `.docx` XML and `pdftotext` on a real generated
`.pdf`).

## Fix (2026-10-05) — last row's ⋮ menu opening off-screen

The row-menu dropdown (records table, History, Manage Users — all three
share the same markup/pattern) always opened downward from its trigger.
For a row near the bottom of the viewport — especially the very last row
on a page, with nothing below it to scroll to — that could open mostly or
entirely off-screen. `lib/dropdownPosition.js` (`positionDropdownToFit`)
measures the trigger's position against the viewport right after a
dropdown is shown (not before — it needs the dropdown's actual rendered
height) and flips it upward (`.row-menu__dropdown--up`, a new CSS
variant) when there isn't enough room below but there is above. Wired
into all three toggle-menu handlers (mainView.js, historyModal.js,
manageUsersModal.js), which were already near-identical copies of the
same logic before this.

## Fix (2026-10-05) — stale app after a deploy; access-grant live sync gap

Two related reports converged on the same root cause: a tab left open
across a deploy (including "Manage Access" sometimes not appearing)
needed a manual refresh to catch up.

- **Root cause**: `registerType: 'autoUpdate'` makes the generated service
  worker call `skipWaiting()`/`clientsClaim()` on its own, but the project
  was only using vite-plugin-pwa's bare auto-injected registration script
  (confirmed directly — `dist/registerSW.js` was a single
  `navigator.serviceWorker.register(...)` call and nothing else). That
  script has no idea a new service worker ever took over, so the
  already-loaded page kept running the OLD JS bundle indefinitely —
  anything shipped since the tab was last fully reloaded (not just
  Manage Access) would be invisible until a manual refresh.
- Switched to explicitly calling `virtual:pwa-register`'s `registerSW()`
  from `main.js` (`injectRegister: false` in `vite.config.js`, so the
  plugin's own auto-injected script doesn't ALSO register and double up).
  Traced its actual behavior directly in
  `node_modules/vite-plugin-pwa/dist/client/build/register.js` rather than
  assuming from the docs: in `autoUpdate` mode, the DEFAULT behavior the
  instant the new service worker activates is a silent
  `window.location.reload()` — risky here, since a facility worker
  mid-way through a maintenance record shouldn't lose that input to a
  reload they never saw coming. `onNeedReload` overrides that default;
  used it to show a small dismissible-by-refreshing banner
  (`lib/swUpdateBanner.js`) instead, trading "always instantly fresh" for
  "never silently loses work in progress."
- **Separately, a real related gap**: the access-grants tables
  (`maintenance_record_access`/`operation_event_access`) were never added
  to the `supabase_realtime` publication at all, unlike
  `maintenance_records`/`operation_events` (2026-09-30's live-sync work) —
  confirmed directly against the live project. A user just granted access
  to a record wouldn't see their new Edit/Delete/Manage-Access ability
  light up live; only an unrelated change to the main tables would
  happen to trigger their next refetch. Fixed with a new migration
  (`20261005000000_realtime_access_grants.sql`) plus subscribing
  mainView.js/historyModal.js to the relevant grant table alongside the
  record table each already watches.

## Decision (2026-10-05) — "+ New Record" spellcheck + a bit wider

- Native browser spellcheck/autocorrect, not a custom dictionary/library —
  `spellcheck="true" autocorrect="on"` on every free-text field shared by
  `renderMaintenanceForm`/`renderOperationForm` (work scope, detailed
  steps, other-status free text, comment). Since those two render
  functions are shared between create (`newRecordModal.js`) and edit
  (`openMaintenanceRecordModal`/`openOperationEventModal`), both get it,
  not just the create flow — same form markup either way.
- `lib/modal.js` gained a third size tier, `{ medium: true }` (600px,
  between the 520px default and the 720px `{ wide: true }` used for
  table-heavy content like historyModal.js) — applied to
  `newRecordModal.js` only, not the standalone edit modals, since only the
  "+ New Record" dialog was asked to be wider.

## Decision (2026-09-30) — live sync between users

Another user creating/editing/soft-deleting a maintenance record or
operation event now refreshes the current view automatically — no more
manual reload to see someone else's change. `lib/realtime.js`
(`subscribeToChanges`) wraps Supabase Realtime's `postgres_changes`:
subscribes to `*` events on the given tables and, debounced (400ms, so a
burst of several changes collapses into one refetch), calls the caller's
existing `reload()`/`load()` — no attempt to reconcile the specific event
payload into local state, just "something changed, refetch." mainView.js
subscribes to both `maintenance_records`/`operation_events`; historyModal.js
subscribes to `operation_events` only, for the life of that modal.

- **DB**: `20260930000000_enable_realtime.sql` adds both tables to the
  `supabase_realtime` publication — confirmed directly against the live
  project that it existed but started with zero tables in it, so this was
  a real, required step, not a formality. No RLS changes needed:
  `postgres_changes` already re-evaluates each table's own SELECT policy
  per subscribing client (the NEW row for INSERT/UPDATE, the OLD row for
  DELETE).
- **One accepted, known consequence of that RLS filtering**: a soft-delete
  is an UPDATE whose NEW row has `deleted_at` set — for a non-admin, that
  new row no longer satisfies their own SELECT policy (`deleted_at IS
  NULL`), so they simply don't get an event for their own record being
  soft-deleted by someone else. It'll still disappear the next time
  anything else triggers a refetch for them, just not instantly. New
  records and plain edits (never touching `deleted_at`) don't have this
  gap — verified directly (see below).
- **Cleanup matters here as much as the subscription itself** — a channel
  left running past its view's lifetime keeps calling a
  `reload()`/`load()` bound to DOM that's no longer on the page, which is
  the exact same leak class as the stale-UI-after-tab-refocus bug fixed
  2026-09-23 (just triggered by a DB change instead of a spurious auth
  event this time). `renderMainView()` now returns an unsubscribe
  function that `main.js` calls before mounting any fresh view;
  historyModal.js unsubscribes via its existing `onClose()` hook, same as
  its outside-click listener.
- **Verified directly, in stages, given the constraints of this
  environment** (no real user password available to fully drive an
  authenticated browser session end-to-end): confirmed the publication
  membership directly in Postgres; confirmed an anon-key Realtime channel
  connects and subscribes cleanly against the live project (catches
  config mistakes — wrong URL/key/table/schema — even without a real
  session); then, with a concurrent real INSERT via `psql`, confirmed that
  same anon subscriber receives **nothing** — which is the *correct*
  behavior (RLS blocking an unauthenticated connection from seeing
  anything at all), not a failure of the feature. Actually receiving a
  live update as a real signed-in user is the one thing this session
  couldn't verify directly — worth a real two-tab check.

## Decision (2026-09-30) — text search across work scope/comments

The main view's Filter dialog gained a "Search" field alongside the
existing date range — case-insensitive substring match against
`work_scope`/`detailed_steps`/`comment`, ANDed with the date range (not a
replacement for it). Maintenance records only, matching what was actually
asked for; operation events / the History modal don't have a "work scope"
field to search in the first place. Deliberately **not** threaded into the
`.docx`/`.pdf` export — an export is meant to be the complete official
record for a date range, not filtered by whatever an admin happened to be
searching for on screen.

- Implemented as an additional `.or(...)` filter on
  `fetchMaintenanceRecords()` (server-side, not fetch-everything-then-
  filter-client-side) — combines with the existing date-range `.or(...)`
  as two separate top-level conditions, ANDed together.
- **A real escaping bug found and fixed before shipping, not assumed
  correct**: tested directly against the live PostgREST endpoint (curl,
  then the actual `supabase-js` call) with a search term containing a
  comma. PostgREST's `or=(...)` filter syntax treats `,`/`(`/`)` as
  structural regardless of backslash-escaping the value — confirmed
  backslash-escaping alone still fails to parse. The actual fix is
  wrapping the `ilike` value in double quotes (`work_scope.ilike."*term*"`
  instead of `work_scope.ilike.*term*`), which then needs its own
  backslash/quote escaping for a term containing either. Verified success
  with a deliberately pathological term (`with, comma (and) parens
  "quote" \backslash`) before considering it done.
- Empty-state message now says "No maintenance records match your search
  in this date range" instead of the generic date-range-only message,
  when a search term is active and nothing matched — `renderSystemsHTML()`
  took a new `hasSearch` param for this rather than guessing from
  `records.length` alone.

## Decision (2026-09-29) — per-record access grants

Admin can now grant a specific OTHER (non-creator, non-admin) user
edit/delete access to one individual maintenance record or operation
event, on top of the existing "creator or admin" rule — a new "Manage
Access" action (admin-only) alongside View/Edit/Delete in both the
records table and the History modal's row menu, opening a checklist of
every active non-admin user except the record's creator.

- **Schema** (`20260929000000_record_access_grants.sql`): two grant
  tables, `maintenance_record_access`/`operation_event_access` (one per
  record type, matching the existing split rather than one polymorphic
  table), each just `(record_id/event_id, user_id, granted_by,
  granted_at)`. SELECT policy lets a user see their own grants (needed
  client-side for their own canEdit check) or, if admin, every grant
  (needed for the modal's checkboxes); INSERT/DELETE were admin-only at
  first — **extended same-day** (see below) once the creator was given
  the same power.
- Extended the existing `maintenance_records_update`/
  `operation_events_update` RLS policies with a third `EXISTS` branch
  alongside `created_by = auth.uid()`/`is_admin()`. A plain edit never
  touches `deleted_at`, so it doesn't hit the implicit-SELECT-policy-on-
  UPDATE gotcha the soft-delete RPCs exist for (see
  20260830050000_soft_delete_rpc.sql) — a normal client `.update()` is
  enough here, no new RPC needed for editing.
- `soft_delete_maintenance_record`/`soft_delete_operation_event` (the
  RPCs, SECURITY DEFINER, bypass RLS and do their own check) got the same
  third condition added inline, so a granted user can delete too, not
  just edit.
- **Verified directly against the live DB** before considering this done
  (not just "the migration ran without error"): inserted a real test
  record inside a transaction, confirmed a non-granted second user's
  update was rejected, had the admin insert a grant, confirmed that SAME
  user's update then succeeded, confirmed their `soft_delete_*` RPC call
  also succeeded, and confirmed a third, still-ungranted user couldn't
  insert a grant for themselves — then rolled the whole transaction back.
  All five assertions passed before any frontend code was written.
- Frontend: `data/recordAccess.js` (fetch/set grants, parameterized by
  `recordType` rather than duplicated per table), `views/
  manageRecordAccessModal.js` (the shared checklist modal), and both
  `recordsTable.js`/`historyModal.js`'s `canEdit` computation extended
  with a `grantedRecordIds`/`grantedEventIds` set — fetched once per
  reload/load, and skipped entirely for an admin session (already has
  full access, no need to know about grants at all).

**Same-day follow-up — creator gets the same "Manage Access" power as
admin**, not just admin: a record's own creator can now grant/revoke
other users' access to it too, not only view/edit/delete it themselves.

- `20260929010000_record_access_creator_parity.sql` adds a third
  condition — `exists (select 1 from maintenance_records/operation_events
  where id = record_id/event_id and created_by = auth.uid())` — to all
  three grant-table policies (SELECT, not just INSERT/DELETE: without it,
  a non-admin creator opening "Manage Access" for their own record would
  see an empty checklist even when grants already existed, since the old
  SELECT policy only ever showed a non-admin their own grant row as
  *grantee*, never rows granting access to someone else on a record they
  merely created). Verified the same way as the first migration — a real
  transaction, rolled back after: the creator (not admin) granted access,
  saw the grant, revoked it, and a third uninvolved user was still
  rejected.
- `canManageAccess` (both view files) is deliberately narrower than
  `canEdit` — creator-or-admin, not "anyone who can edit" — so a merely
  *granted* user can't turn around and grant a third person access.
- **Caught before shipping**: the click handler was calling `fetchUsers()`
  (`data/users.js`), which wraps the `list_users()` RPC — admin-only
  server-side (it joins `auth.users` for email), so a non-admin creator
  would have silently gotten an empty candidate list, making the whole
  feature look broken for anyone but an admin. Fixed by adding
  `fetchGrantableUsers()` (`data/profiles.js`) instead — a plain
  `profiles` select (`id, username, full_name, role, is_active`, no
  email), which `profiles_select`'s RLS already permits for any allowed
  user, admin or not (the same policy `fetchProfileNames()` already
  relies on for "Created by" display names).

## Fix (2026-09-23) — stale UI after alt-tab away and back mid-modal

Reported: open "+ New Record", alt-tab to another app and back, and the
save appears to succeed but the main view never shows the new record
until a manual page refresh. Root cause: `main.js`'s `render()` wipes and
remounts `#app` from scratch, and `auth.js`'s `onAuthStateChange()` called
it on *every* Supabase auth event — including `TOKEN_REFRESHED`, which
Supabase fires routinely and notably the moment a backgrounded tab
regains focus, not just on a real sign-in/out. The modal itself survives
a remount (`lib/modal.js` appends its overlay to `document.body`, not
`#app`), so the user could still fill it in and the write still went
through — but its `onSaved`/`reload()` closure was bound to the now-
discarded old view's `recordsContainer`, which the visible (new) view no
longer has any connection to. Fixed by filtering to `SIGNED_IN`/
`SIGNED_OUT` only in `onAuthStateChange()` — those are the only events
that represent an actual change in who's signed in.

## Decision (2026-09-04) — logo refresh

Swapped in a cleaner higher-res render of the same gold-h/silver-o
handshake logo (1254x1254 source vs. whatever the 2026-09-01 source was)
— same design, not a rebrand. Regenerated all 4 `public/icons/*.png`
files with the identical process documented below (straight resizes for
icon-192/icon-512/apple-touch-icon; floodfill-isolate + recomposite at
~65% width for icon-maskable-512 — verified bounding box was
333x336+89+88 on the 512x512 canvas, ~17.4% margin, consistent with the
original). This time the source is also kept, at `branding/logo-source.png`
(sibling to `src/`/`public/`, not inside it — see the 2026-09-23 fix
below for why that distinction matters) as the master for future
re-generation, since the prior round left no source file in the repo at
all — a human had to re-supply the original logo image from outside the
repo to redo this.

**Fixed 2026-09-23**: it was first committed inside `public/icons/`, which
Vite copies verbatim into every deploy — a 2.3MB source render doesn't
need to ship to production at all, and it actually broke the build
outright once workbox tried to precache it (over its default 2MB
per-file limit, which errors instead of just warning). Moved to
`branding/` — still tracked in git for future regeneration, no longer
served or precached.

## Decision (2026-09-01) — real app icon

Replaced the Phase 1 ImageMagick "H" placeholders with real branding: a
provided logo (gold "h" / silver "o" — Handover — with a handshake at the
join). `public/icons/icon-192.png`/`icon-512.png` are straight resizes of
the square source (already black-background, content roughly centered —
no aggressive OS cropping applies to "any"-purpose icons, so no extra work
needed there).

`icon-maskable-512.png` needed real work: Android crops maskable icons
into arbitrary shapes (circle, squircle, ...) using a safe zone centered
in the icon, and the source image's own margins (~10-12% left/right)
were right at the bare minimum, risky across different OEM mask shapes.
Rebuilt it by floodfill-removing the source's near-black background
(plain `-transparent`/color-threshold would have punched holes in the
letters' own dark shadow areas; floodfill from the four corners only
touches the contiguous background region) and recompositing the isolated
logo onto a fresh 512x512 black canvas at ~65% width — leaving ~17.5%
margin on the tightest axis, comfortably past the standard safe-zone
requirement. Confirmed by the resulting bounding-box math, not just
eyeballing it.

Also added: `apple-touch-icon.png` (180x180) + `<link rel="icon">`/
`<link rel="apple-touch-icon">` in `index.html` — there was no favicon at
all before (Android's install path went through the manifest, but nothing
covered the plain browser tab or iOS's own "Add to Home Screen", which
reads this link tag rather than the manifest).

## Decision (2026-08-30) — light/dark theme follows platform preference

The app was dark-only. Every stylesheet already read colors exclusively
through `variables.css`'s custom properties (no literal colors elsewhere,
confirmed by grep), so the only change needed was there: light became the
default `:root` palette, with the original dark palette moved under
`@media (prefers-color-scheme: dark)` — no manual toggle, since none was
asked for, just following the OS/browser setting automatically.
`index.html`'s `<meta name="theme-color">` similarly split into two tags
(one per `prefers-color-scheme` value) so the mobile browser chrome/status
bar tint follows too. The PWA manifest's own `theme_color`/`background_color`
(used for the install splash screen) stay fixed on the dark values —
browser support for a manifest-level light/dark split is inconsistent
enough that it wasn't worth chasing for a rarely-seen splash screen.

## Decision (2026-08-30) — refinement batch 2

- **Installed app wouldn't rotate, the plain browser tab did**: the
  manifest never set `orientation` at all — the spec's documented default
  for an absent field is "any" (no lock), but several Android
  WebAPK/Chrome versions don't actually honor that and lock a standalone-
  display PWA to whatever orientation it was in at install time instead.
  Fixed by setting `orientation: 'any'` explicitly (`vite.config.js`)
  rather than relying on the unstated default. **Needs a fresh
  install to take effect** on a device that already added the old
  manifest to its home screen — removing and re-adding it (or waiting for
  Android's own WebAPK update check) picks up the new manifest; a plain
  page reload doesn't.
- **Filter dialog**: From/To also moved onto one row (`.form-row`,
  matching the record dialog's Start/End date change above).
- **History dialog gets a "View" action** (`openViewOperationEventModal`),
  same reasoning and `.record-details` convention as Manage Users' new
  View action above. Mobile: History now hides Timestamp and Comment
  (keeps Action/By/Actions) — same "hide it, reach it via View" pattern
  as Manage Users' Email/Status.

## Decision (2026-08-30) — post-Phase-6 refinement batch

First batch after closing out PLAN.md's phases (see PLAN.md's status
note) — mobile-usability fixes found by real-device testing, plus a couple
of small feature additions:

- **Password fields get an explicit show/hide toggle everywhere**
  (`lib/passwordToggle.js`, used by login/change-password/admin
  create-user/set-password): a native browser reveal icon isn't reliable
  across mobile browsers — desktop Chrome/Edge often show one, but mobile
  Chrome only under certain conditions/settings, and iOS Safari doesn't
  show one for an arbitrary password field at all — which is why one
  wasn't showing up on mobile despite every field being a normal
  `type="password"` input.
- **Mobile: the ⋮ action button was overflowing past the table's right
  edge** on all three tables (records/users/history) — `table-layout:
  fixed` cells don't grow to fit content, and the button's fixed
  1.75rem/28px size no longer fit inside a 6%-wide column once the
  table's own width shrank to a phone's usable width. Bumped the actions
  column to 12% in each table's mobile media query (records.css) —
  confirmed by arithmetic against a ~320px worst-case phone width, not
  just visually assumed fixed.
- **Manage Users, mobile**: hides Email and Status (keeps
  Username/Full name/Role) for the same reason the main records table
  already hides Start date on mobile — not enough width for every column.
  Added a "View" action (`openViewUserModal`) to reach the hidden fields,
  same `.record-details` read-only convention as `viewRecordModal.js`.
- **Header hamburger menu width**: reuses `.row-menu__dropdown`'s
  150px min-width, sized for the per-row menu's short items — bumped to
  200px for `#user-menu-dropdown` specifically (by id, not by raising the
  shared class) so "Manage Users"/"Change Password" don't wrap.
- **Record dialog**: Start date/End date moved onto one row (`.form-row`,
  modal.css) instead of stacked, to save vertical space.

## Decisions made (2026-08-30) — user management

| Question | Decision | Why / implication |
| --- | --- | --- |
| How does an admin create a new account in-app (instead of the dashboard)? | **Edge Function `admin-manage-users`, action `create`** | Creating an `auth.users` row requires the Admin API (`auth.admin.createUser`), which needs `service_role` — never usable from the browser. The function verifies the caller is authenticated and `is_admin()` (via their own session) before touching `service_role`, which is only ever held inside the function's own runtime. |
| How does an admin edit someone's role/username/active status? | **Plain client-side `UPDATE` on `profiles`, RLS-governed** | Unlike account creation, this doesn't need `service_role` — added a `profiles_update` policy (`using (is_admin()) with check (is_admin())`, `20260830100000_admin_manage_users.sql`). `profiles` had **no** update policy at all before this; role/username changes were SQL-editor-only until now. |
| How does an admin see users' email addresses? | **`list_users()` SECURITY DEFINER RPC** | Email lives in `auth.users`, which RLS can't reach (Supabase-managed schema, not ours). The function joins `auth.users` + `profiles` and checks `is_admin()` itself — a non-admin gets an empty result, not an error (a read, so silent-empty is fine; contrast with the Edge Function's writes, which raise real errors for a non-admin). |
| How does an admin set someone ELSE's password? | **Edge Function, action `set-password`** | Same `service_role` requirement as account creation (`auth.admin.updateUserById`). |
| Can an admin delete a user account? | **Yes — hard delete, with optional reassignment, Edge Function action `delete`** | Same `service_role` requirement (`auth.admin.deleteUser`). `profiles.id` cascades on delete, but `maintenance_records`/`operation_events`'s `created_by`/`updated_by` do **not** (plain `REFERENCES`, no `ON DELETE` clause) — deleting a user who has ever created/edited a record fails with a foreign-key error, rather than silently orphaning/erasing their audit trail. The "Delete User" modal offers reassigning that user's records to a different, still-existing user first (updates all four columns across both tables via `service_role`, bypassing RLS since it must touch rows the deleting admin doesn't own), then deletes — or the admin can decline reassignment and let it fail, and deactivate (`is_active = false`) instead. Blocked for deleting your own account, same self-lockout reasoning as demote/deactivate. |
| How does a user change their OWN password? | **Direct client call, no Edge Function** | `supabase.auth.updateUser({ password })` works with the caller's own session — no `service_role` needed for your own account. Re-verifies the current password first via a fresh `signInWithPassword` call (Supabase's `updateUser` doesn't require this on its own, which would otherwise let anyone with a hijacked/unlocked session change the password without knowing it, locking the real owner out). |
| Can an admin deactivate/demote themselves via the UI? | **No — blocked client-side** | Confirmed by direct testing: deactivating your own profile instantly loses you `is_allowed_user()`/`is_admin()` (both check the *caller's own* profile), locking you out of every table immediately, no error, no undo except another admin (or direct DB access) reactivating you. Correct behavior for deactivating *someone else*, a nasty footgun on yourself. The "Manage Users" edit form disables the role/active controls on the signed-in admin's own row. **Not enforced server-side** — a big enough gap to note, small enough (single-admin internal tool) not to fix with an RLS/trigger guard right now. |

## Decisions made (2026-08-27)

| Question | Decision | Why / implication |
| --- | --- | --- |
| Frontend framework | **Vanilla JS + Vite** | No framework lock-in, smallest bundle, simplest PWA setup. Use `vite-plugin-pwa` for manifest + service worker instead of hand-rolling. |
| Offline scope | **App-shell caching only** | Service worker caches static assets so the app *launches* offline and shows last-loaded data. Reads/writes require connectivity. No IndexedDB write queue, no sync/conflict logic. |
| Edit/delete permissions | **Own records only** | RLS restricts UPDATE to rows where `created_by = auth.uid()`. Real DELETE is disabled entirely in favor of soft delete (see below), and the soft-delete "delete" action is implemented as an UPDATE, so the same own-records-only rule applies to it. **Known limitation**: one user cannot fix another user's mistake in the UI. If that becomes a problem, add an admin-override path later (e.g. a `security definer` RPC) rather than loosening RLS broadly. |
| Delete behavior | **Soft delete, 30-day retention** | Rows get `deleted_at` set instead of being removed. Hidden from regular-user reads via RLS SELECT policy (`deleted_at IS NULL`); an admin can see and restore a deleted row via the UI (see 2026-08-30 addition below). After 30 days, a daily `pg_cron` job (`20260830070000_purge_deleted_after_30_days.sql`) permanently deletes it — no restore possible past that point. Real client-side `DELETE` is still never granted; only this scheduled job and the admin restore RPC can change `deleted_at`. |

## Postgres/RLS gotcha found in Phase 2 (2026-08-29) — soft delete needs an RPC

Soft-deleting via a plain client-side `UPDATE ... SET deleted_at = now()`
**always fails RLS**, for every user including admins, with `new row
violates row-level security policy`. This has nothing to do with
ownership/admin logic (which was correct) — it's a genuine, documented
Postgres behavior: **for UPDATE, Postgres implicitly re-checks the table's
SELECT policy against the resulting row, in addition to the UPDATE
policy's own `WITH CHECK`, whether or not `RETURNING`/`.select()` is
used.** Our SELECT policy is `deleted_at IS NULL` — so any update that
moves `deleted_at` away from `NULL` fails that implicit check immediately,
independent of the UPDATE policy passing. No ownership/RLS-policy tweak can
fix this; confirmed empirically (temporarily loosening just the SELECT
policy made the identical update succeed) before concluding it wasn't a
deployment/migration-timing issue.

**Fix**: soft delete goes through a `SECURITY DEFINER` RPC
(`soft_delete_maintenance_record` / `soft_delete_operation_event`,
`20260830050000_soft_delete_rpc.sql`) instead of a direct client UPDATE.
The function bypasses RLS internally (runs as its owner) and does its own
manual authorization check (same own-record-or-admin rule) before writing.
`operation_events` was given the identical fix pre-emptively, since it has
the same `deleted_at`-based SELECT policy shape and would hit this exact
bug the moment Phase 3 adds delete there — worth remembering if any other
table ever needs "write a row into a state that its own SELECT policy
would hide" (this one bit us on first contact and will bite again on any
new table shaped the same way).

## Decisions made (2026-08-30) — admin restore + purge retention

| Question | Decision | Why / implication |
| --- | --- | --- |
| Can admin see/undo a deleted record? | **Yes** | `maintenance_records_select` RLS now allows `deleted_at IS NOT NULL` rows through for `is_admin()`; a `restore_maintenance_record` RPC (same SECURITY DEFINER pattern as delete) clears `deleted_at`. Regular users still can't see deleted rows at all — this is an RLS-level guarantee, not a UI-only hide. `operation_events` was deliberately left out of this one initially (it had no delete UI at the time) — given the same treatment once Phase 3's History modal existed to expose it: `operation_events_select`, `restore_operation_event`, `hard_delete_operation_event` (`20260830090000_admin_view_restore_operation_events.sql`), with a "Show deleted" toggle in the History modal mirroring the main table's. |
| How long do soft-deleted records live before permanent removal? | **30 days**, or immediately if an admin chooses to | A daily `pg_cron` job (`purge_soft_deleted_records`, `20260830070000_purge_deleted_after_30_days.sql`) hard-deletes any row with `deleted_at` older than 30 days, for both `maintenance_records` and `operation_events`. Tested against controlled data before relying on it (a 31-day-old deleted row was purged; a 5-day-old one and a never-deleted one both survived). An admin can also permanently delete a soft-deleted record on demand, via `hard_delete_maintenance_record` (`20260830080000_admin_hard_delete.sql`) — same SECURITY DEFINER pattern, only callable on a record that's already soft-deleted (guards against skipping the soft-delete step). Either way, past that point a record is gone for good — no admin restore, no direct-DB recovery. |

## Decision (2026-08-30) — `docx` is lazy-loaded, not a top-level import

The `docx` library is large (~350KB) and only needed once someone actually
clicks Export. `mainView.js`'s Export handler loads it via a dynamic
`import('../lib/docxExport.js')` instead of a static top-level import —
confirmed via build output that this keeps it out of the main bundle
(~253KB, matching pre-`docx` size) as a separate chunk that only loads on
demand. The generated document itself was verified directly (not just "the
build doesn't error"): a real test document was produced from
representative data and its XML content inspected, confirming dd-mm-yyyy
formatting, correct chronological ordering, a Swap event appearing under
both equipment with the right direction ("→"/"←"), the Running tag, and an
empty system being omitted entirely — all before ever asking anyone to
open it in an actual Word viewer.

## Decision (2026-08-30) — `.pdf` export added (reverses "no PDF")

A second export format was requested: `.pdf`, generated client-side via
`pdfmake` (a plain-JS library with a bundled font set — no native/WASM
dependency, so it stays fully offline-capable once loaded), exposed as a
fourth FAB alongside Export (docx)/Filter/Add Record. `lib/pdfExport.js`
deliberately mirrors `lib/docxExport.js`'s content and omission rules
exactly (same System banner → Equipment header → chronological table,
same `hide_when_empty`/Generic-equipment rules, same Swap-on-both-units) —
only the rendering API differs — so the two formats can't drift apart.
Verified directly (not just "the build doesn't error"): generated a real
PDF from representative data via pdfmake's Node API and confirmed with
`pdftotext` that the text content, table structure, and bullets all came
through correctly, before ever wiring it into the UI.

One accepted gap versus the `.docx` export: pdfmake has no equivalent of
`keepNext`/`tableHeader`'s page-break protections (an equipment header
orphaned alone at the bottom of a page). **Investigated properly on
2026-08-30** after the user hit it for real (also reported: the system
banner rendering as unreadable white-on-white — a real bug, `fillColor`
used on a plain text node instead of `background`; `fillColor` only
applies inside a table cell, so it was silently ignored. Fixed. The
earlier `pdftotext`-based verification only checked text content, not
visual legibility — a real gap in that check).

For the orphaning gap, both of pdfmake's "keep together" primitives were
tried and both turned out to be unsafe, confirmed by directly generating
and rendering test PDFs (not just reasoning about the API):

- `unbreakable: true` on a stack (header+table together): if the stack
  doesn't fit in the *remaining* space on the current page, pdfmake
  doesn't retry it on a fresh page — it **silently drops the entire
  stack**. A 25-row equipment table's whole banner+header+table section
  vanished from a real generated PDF.
- `table.dontBreakRows: true` (keep each row whole): same failure mode
  one level down — an oversized single row (long bullets) was **silently
  dropped** from the table entirely rather than pushed to the next page.

Given that, the header-orphaning cosmetic gap was initially kept rather
than "fixed" with either mechanism — a header occasionally sitting alone
at the bottom of a page is a real but minor readability issue; silently
missing records from an official handover document is not an acceptable
trade for fixing it. Table headers still repeat correctly via
`headerRows: 1`, which doesn't have this failure mode. **Superseded below
(2026-08-31)** — the gap was later closed properly, with a cap.

Also: `lib/downloadBlob.js` was split out of `docxExport.js` (which
previously defined and exported it) into its own zero-dependency file, so
that both `docxExport.js` and the new `pdfExport.js` can use it without
statically importing (and thus bundling) each other's export library —
each stays an independently lazy-loaded chunk. `vite.config.js`'s
`workbox.globPatterns` also picked up a `globIgnores` for both export
chunks (docx included, not just the new pdfmake one): pdfmake plus its
bundled font set is ~1.7MB, and neither export library needs to be
precached for offline use — exporting already requires a live Supabase
fetch of fresh data regardless of what the service worker has cached.

## Decision (2026-08-31) — pdf keep-with-next fixed properly, with a cap

Revisits the note directly above, after the user hit the orphaning gap for
real ("equipment header on one page, its table on the next"). Retested
`unbreakable: true` more precisely this time: a small header+table stack
pushed near a page boundary (but that fits comfortably on one page) *was*
handled correctly — moved cleanly to the next page, nothing lost. The
earlier finding was real but narrower than first stated: `unbreakable`
only drops content when the stack is taller than a full page, not
whenever it doesn't fit in the *remaining* space (which is the normal,
common case).

So: `equipmentHeader` + its table (and the system banner, riding along
with the first equipment) are now wrapped `unbreakable: true`, but only
when the equipment's timeline has `MAX_ROWS_FOR_KEEP_TOGETHER` (6) rows or
fewer — a deliberately conservative, rough proxy for "small enough to
safely assume it fits one page" (most real usage does, given the app's
default "last 7 days" filter). Above that cap, header+table fall back to
the old plain sequential rendering — occasionally an orphaned header, but
never a dropped record. Verified directly with three generated-and-
rendered test PDFs: several small equipment blocks correctly kept
together across page boundaries, and a 30-row table (over the cap)
rendered with all 30 records and its own header intact, no data loss.

## Decision (2026-08-30) — main view toolbar redesign: FAB cluster + hamburger menu

Add Record / Filter / Export used to sit as always-visible buttons in an
inline toolbar row; Sign Out / Change Password / Manage Users sat as
separate buttons in the header. Both revised to be hidden by default:

- Add Record, Filter, Export now live behind a single circular
  floating-action-button (FAB) fixed to the bottom-right of the page,
  showing a dots icon; clicking it expands/collapses three sub-FABs (one
  per action), each with an icon + `title` hint. Reuses the existing
  `[hidden]`-gated show/hide + outside-click-to-close mechanics the
  row-menu (⋮) dropdown already used, generalized into one `setupToggle()`
  helper in `mainView.js` shared with the header menu below.
- Filtering (date range + admin-only "show deleted") moved out of the
  inline form into a dialog (`views/filterModal.js`), opened from the
  Filter FAB.
- Sign Out / Change Password / Manage Users moved into a dropdown behind a
  hamburger (☰) button in the header, using the same toggle mechanism.

## Decisions made (2026-08-29) — auth pivot

The magic-link plan above was replaced before any real users were onboarded
(nobody had been invited yet). Reason: the ~10 users are facility workers
sharing devices/terminals, not each reliably checking their own email inbox
for a link — handing out an email + password they can type is more workable
day to day than a magic-link flow.

| Question | Decision | Why / implication |
| --- | --- | --- |
| Sign-in method | **Supabase Auth, email + password** (not magic link) | Login is by **email**, not a separate username — `username` is a display-only field (see `profiles` below). Still 100% Supabase Auth under the hood, so RLS's `auth.uid()`/`auth.jwt()` keep working unchanged; no custom password storage was built (that would be a real security problem and would break every existing RLS policy, which depend on a real Supabase Auth session). |
| Account creation | **Admin creates every account directly** | No public/self-serve sign-up (kept disabled in Auth settings). Admin uses Supabase Dashboard → Authentication → Users → "Add user" (sets email + password there), then sets that user's `username`/`role` in the new `profiles` table. No in-app "create user" UI in Phase 1 — see PLAN.md if that's wanted later (would need a `service_role`-backed Edge Function, since the admin API key can never ship to the browser). |
| Roles | **`profiles.role`: `'user'` or `'admin'`, admin has real extra power now** | One `public.profiles` row per `auth.users` row (`username`, `role`, `is_active`), auto-created by a trigger on `auth.users` insert (default `role = 'user'`) so the admin only has to flip the one real admin account's role afterward. Admin can edit/delete **any** record, not just their own — RLS on `maintenance_records`/`operation_events` UPDATE now allows `created_by = auth.uid() OR is_admin()`. Regular users keep the existing own-records-only rule. |
| Allowlist mechanism | **Replaced by `profiles` row existence** | The original `allowed_users` email table is dropped — with public sign-up disabled and every account admin-created, an existing `auth.users` row *is* the allowlist. `is_allowed_user()` now checks for an active `profiles` row (`profiles.is_active`) instead of an email list; kept as the same function name so no other RLS policy had to change. `is_active` also gives a cheap way to revoke a departed worker's access later without deleting their auth account. |

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
- **Allowlist enforcement (superseded 2026-08-29, see decisions above)**: now
  two-layered — disable public sign-up in Auth settings (so nobody can
  self-register even by calling the client SDK directly), plus
  `is_allowed_user()` checking `profiles.is_active` — checked in every RLS
  policy, same as before, just backed by `profiles` instead of an email list.
- **Business rules enforced at the DB layer (not just client-side)**:
  - `end_date` auto-fill/lock for `maintenance_records` (see the migration
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
  their date falls in range. **Revised 2026-08-30**: operation events are
  **not** shown in the main view's table at all (an attempt to add them
  there, combined chronologically with maintenance records, was built and
  then explicitly reverted) — they're viewed via the "History" button only.
  The date-range-filtered combined view this bullet describes still applies
  to the `.docx` export below, which is why `lib/combinedTimeline.js` (the
  merge logic built for the reverted attempt) was kept rather than deleted.
- Multi-line fields render as bullet lists in View modal.
- Export button: `.docx` for current filtered range — System banner (styled)
  → Equipment sub-header (styled, shows Running status) → combined
  chronological table of maintenance records + operation events, Swap events
  appear under **both** equipment involved. **Revised 2026-08-30**: omission
  ended up matching the main view's `hide_when_empty` rule (only
  Workshop/Others/Scarab GTG omit when empty — not literally every system,
  as first built and then corrected) plus one export-only addition: every
  system's "Generic" catch-all equipment is omitted when it has no
  activity, tracked system or not.
- Auth: email + password login (originally spec'd as magic link — see
  "2026-08-29 — auth pivot" above), admin-created accounts only, enforced
  via RLS.

## Companion docs

- [supabase/migrations/](supabase/migrations/) — Postgres schema + RLS
  policies (deployed via Supabase's GitHub integration).
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — frontend folder layout.
- [PLAN.md](PLAN.md) — phased build plan, Phase 1 = minimal slice (auth +
  read-only display grouped by system/equipment).

Phase 1 (auth + read-only display) is implemented — see PLAN.md for current
status. This file stays the durable source of truth for requirements and
decisions regardless of implementation progress, so future sessions don't
need to re-ask the same questions.
