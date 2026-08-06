-- Allow one weekly packet to combine tournaments selected per training group.
-- Existing packets keep their original tournament through the backfill.

alter table public.weekly_callup_categories
  add column if not exists tournament_id uuid null references public.tournaments(id) on delete restrict,
  add column if not exists tournament_name_snapshot text null;

update public.weekly_callup_categories category
set
  tournament_id = callup.tournament_id,
  tournament_name_snapshot = coalesce(tournament.name, 'Torneo')
from public.weekly_callups callup
left join public.tournaments tournament on tournament.id = callup.tournament_id
where callup.id = category.weekly_callup_id
  and (category.tournament_id is null or category.tournament_name_snapshot is null);

create index if not exists idx_weekly_callup_categories_tournament
  on public.weekly_callup_categories(tournament_id);

comment on column public.weekly_callup_categories.tournament_id is
  'Tournament whose paid roster populated this training-group snapshot.';

comment on column public.weekly_callup_categories.tournament_name_snapshot is
  'Frozen tournament label used by the editor and WhatsApp image.';
