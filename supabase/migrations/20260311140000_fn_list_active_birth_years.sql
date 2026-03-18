-- Returns distinct birth years (desc) for players with active enrollments.
-- Used to populate the Categoría filter dropdown efficiently.
create or replace function public.list_active_birth_years()
returns table(birth_year int)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct extract(year from p.birth_date)::int as birth_year
  from public.players p
  join public.enrollments e on e.player_id = p.id
  where e.status = 'active'
    and p.status = 'active'
  order by birth_year desc;
$$;

grant execute on function public.list_active_birth_years() to authenticated;
