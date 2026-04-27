-- Permanent public player IDs for staff-facing rosters and printed sheets.
-- IDs are global, human-readable, and never intentionally reused.

alter table public.players
  add column if not exists public_player_id text null;

create sequence if not exists public.player_public_id_seq;

do $$
declare
  v_existing_max bigint;
  v_new_max bigint;
begin
  select coalesce(max((substring(public_player_id from '^DF-([0-9]+)$'))::bigint), 0)
    into v_existing_max
  from public.players
  where public_player_id ~ '^DF-[0-9]+$';

  with numbered as (
    select
      id,
      row_number() over (order by created_at, last_name, first_name, id) as seq
    from public.players
    where public_player_id is null or btrim(public_player_id) = ''
  )
  update public.players p
     set public_player_id = 'DF-' || lpad((v_existing_max + numbered.seq)::text, 4, '0')
    from numbered
   where p.id = numbered.id;

  select coalesce(max((substring(public_player_id from '^DF-([0-9]+)$'))::bigint), 0)
    into v_new_max
  from public.players
  where public_player_id ~ '^DF-[0-9]+$';

  perform setval('public.player_public_id_seq', greatest(v_new_max, 1), v_new_max > 0);
end $$;

create unique index if not exists idx_players_public_player_id
  on public.players(public_player_id)
  where public_player_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_public_player_id_format'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_public_player_id_format
      check (public_player_id is null or public_player_id ~ '^DF-[0-9]{4,}$');
  end if;
end $$;

create or replace function public.assign_player_public_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_candidate text;
begin
  if new.public_player_id is not null and btrim(new.public_player_id) <> '' then
    new.public_player_id := upper(btrim(new.public_player_id));
    return new;
  end if;

  loop
    v_next := nextval('public.player_public_id_seq');
    v_candidate := 'DF-' || lpad(v_next::text, 4, '0');

    if not exists (
      select 1
      from public.players
      where public_player_id = v_candidate
    ) then
      new.public_player_id := v_candidate;
      exit;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_assign_player_public_id on public.players;
create trigger trg_assign_player_public_id
  before insert on public.players
  for each row
  execute function public.assign_player_public_id();
