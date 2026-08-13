-- Keep training-group assignment state aligned with enrollment lifecycle.

create or replace function public.close_training_group_assignment_on_enrollment_end()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_end_date date;
begin
  if new.status not in ('ended', 'cancelled') then
    return new;
  end if;

  if old.status is not distinct from new.status
     and old.end_date is not distinct from new.end_date then
    return new;
  end if;

  v_end_date := coalesce(new.end_date, (now() at time zone 'America/Monterrey')::date);

  update public.training_group_assignments assignment
  set end_date = greatest(assignment.start_date, v_end_date),
      updated_at = now()
  where assignment.enrollment_id = new.id
    and assignment.end_date is null;

  return new;
end;
$$;

drop trigger if exists trg_close_training_group_assignment_on_enrollment_end
  on public.enrollments;

create trigger trg_close_training_group_assignment_on_enrollment_end
after update of status, end_date on public.enrollments
for each row
execute function public.close_training_group_assignment_on_enrollment_end();

revoke all on function public.close_training_group_assignment_on_enrollment_end() from public, anon, authenticated;

-- Repair historical rows without deleting assignment or attendance history.
update public.training_group_assignments assignment
set end_date = greatest(
      assignment.start_date,
      coalesce(enrollment.end_date, (now() at time zone 'America/Monterrey')::date)
    ),
    updated_at = now()
from public.enrollments enrollment
where enrollment.id = assignment.enrollment_id
  and enrollment.status in ('ended', 'cancelled')
  and assignment.end_date is null;

-- The Contry Selectivo 2010/2011 group was intentionally consolidated into FPT.
-- Refuse to deactivate it if any active enrollment is still assigned there.
do $$
declare
  v_group_id constant uuid := 'ba9aa813-5c37-47fb-9638-da1b15e38c48';
  v_active_count integer;
begin
  select count(*)::integer
  into v_active_count
  from public.training_group_assignments assignment
  join public.enrollments enrollment on enrollment.id = assignment.enrollment_id
  where assignment.training_group_id = v_group_id
    and assignment.end_date is null
    and enrollment.status = 'active';

  if v_active_count <> 0 then
    raise exception 'Cannot deactivate Contry Selectivo 2010/2011: % active enrollment assignment(s) remain', v_active_count;
  end if;

  update public.training_groups
  set status = 'inactive',
      updated_at = now()
  where id = v_group_id
    and status <> 'inactive';
end;
$$;

comment on function public.close_training_group_assignment_on_enrollment_end() is
  'Closes any open training-group assignment when its enrollment ends or is cancelled.';
