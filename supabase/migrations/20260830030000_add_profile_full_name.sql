-- Add a display full name alongside username/role, for use in exports and
-- anywhere the UI wants a person's real name rather than their short
-- username. Nullable/optional — not every profile needs to set it.

alter table public.profiles add column if not exists full_name text;
