-- Fix: equipment_status / equipment_status_events were created without
-- `security_invoker = true`, so Postgres ran them with the *view owner's*
-- privileges rather than the querying user's — bypassing RLS on
-- operation_events entirely. Any caller with just the anon key could read
-- all operation events, including soft-deleted ones, through these views.
-- Flagged by Supabase's own linter as "Unrestricted" in the Table Editor.
--
-- Fix is a one-line reloption per view — no need to redefine their bodies.

alter view public.equipment_status_events set (security_invoker = true);
alter view public.equipment_status set (security_invoker = true);
