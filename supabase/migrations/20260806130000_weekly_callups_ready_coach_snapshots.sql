-- Weekly callups are immediately usable and retain the coaches assigned when
-- the packet was prepared. Existing packets remain editable and deletable.

alter table public.weekly_callup_categories
  add column if not exists coach_names_snapshot text null;

update public.weekly_callup_categories category
set coach_names_snapshot = coalesce((
  select string_agg(
    nullif(btrim(concat_ws(' ', coach.first_name, coach.last_name)), ''),
    ', '
    order by assignment.is_primary desc, coach.first_name, coach.last_name
  ) as names
  from public.training_group_coaches assignment
  join public.coaches coach on coach.id = assignment.coach_id
  where assignment.training_group_id = category.training_group_id
    and coach.is_active = true
), 'Sin coach')
where category.coach_names_snapshot is null;

update public.weekly_callup_categories
set coach_names_snapshot = 'Sin coach'
where coach_names_snapshot is null;

update public.weekly_callups
set status = 'ready', updated_at = now()
where status = 'draft';

comment on column public.weekly_callup_categories.coach_names_snapshot is
  'Frozen principal and auxiliary coach names shown on the weekly WhatsApp image.';
