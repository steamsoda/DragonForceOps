-- Add optional jersey number to players (0–999, null = not assigned)
alter table public.players
  add column jersey_number smallint null
  constraint players_jersey_number_check check (jersey_number >= 0 and jersey_number <= 999);
