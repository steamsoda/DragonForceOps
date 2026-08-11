begin;

alter table public.weekly_callup_categories
  drop constraint if exists weekly_callup_categories_weekly_callup_id_training_group_id_key;

create unique index if not exists uq_weekly_callup_category_group_legacy
  on public.weekly_callup_categories(weekly_callup_id, training_group_id)
  where competition_roster_squad_id is null
    and training_group_id is not null;

create unique index if not exists uq_weekly_callup_category_live_squad
  on public.weekly_callup_categories(weekly_callup_id, competition_roster_squad_id)
  where competition_roster_squad_id is not null;

comment on index public.uq_weekly_callup_category_live_squad is
  'Allows Azul, Blanco, combined, and ordinary squads from the same training group to freeze independently.';

commit;
