-- Add is_goalkeeper boolean to charges for clean filtering of goalkeeper uniform sales.
-- Nullable: null = not a uniform charge / not applicable; false = field player; true = goalkeeper.

alter table public.charges
  add column if not exists is_goalkeeper boolean null;
