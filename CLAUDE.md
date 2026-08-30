# Handover — instructions for Claude

Read [README.md](README.md) first, then [SPEC.md](SPEC.md) (requirements +
dated decision log — the durable source of truth) and [PLAN.md](PLAN.md)
(phase status — all phases are done; further work is ad hoc, logged in
SPEC.md, not tracked as phases). [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
explains the frontend folder layout and conventions. Check these before
re-deriving requirements or re-asking settled questions.

## Hard rules

- **Never run `git push`.** Commit locally, then hand the user the exact
  push command (and any Supabase SQL/CLI commands) to run themselves.
- **Commit messages: short, one line.** No multi-paragraph bodies.
- `supabase/migrations/*.sql` auto-deploys via Supabase's GitHub
  integration on push. `supabase/functions/*` does **not** — it needs a
  manual `supabase functions deploy <name>` via the CLI, which only the
  user can run (no login access from this session).
- Don't commit secrets or connection strings. The Supabase project ref,
  pooler connection string, etc. are the user's to provide — ask if
  needed, don't assume they're saved anywhere in this repo.

## Verify, don't assume

This project's history includes several bugs a clean build would have
missed: an RLS policy that silently no-ops a write, a CSS specificity tie
that silently no-ops an override, docx column widths that were
structurally correct but didn't render right in Word. When a change
touches RLS, a CSS override, or a generated document (docx/pdf), verify it
directly (`psql`, inspecting the generated file's actual content, etc.)
rather than trusting "it built without errors."
