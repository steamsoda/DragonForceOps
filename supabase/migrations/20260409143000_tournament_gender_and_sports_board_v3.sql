alter table public.tournaments
  add column if not exists gender text;

update public.tournaments
set gender = coalesce(gender, 'mixed')
where gender is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournaments'::regclass
      and conname = 'tournaments_gender_check'
  ) then
    alter table public.tournaments
      add constraint tournaments_gender_check
      check (gender in ('male', 'female', 'mixed'));
  end if;
end $$;

comment on column public.tournaments.gender is
  'Competition gender scope: male, female, or mixed.';
