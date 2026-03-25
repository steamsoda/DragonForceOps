-- Fix: assign_payment_folio must run as SECURITY DEFINER so the trigger can
-- always read/write campus_folio_counters regardless of the calling user's RLS context.
create or replace function public.assign_payment_folio()
returns trigger language plpgsql security definer as $$
declare
  v_campus_id   uuid;
  v_campus_code text;
  v_year_month  text;
  v_seq         int;
begin
  -- Get campus_id through enrollment
  select campus_id into v_campus_id
  from public.enrollments
  where id = NEW.enrollment_id;

  if v_campus_id is null then
    return NEW;  -- can't assign folio; leave null
  end if;

  -- Get campus code
  select code into v_campus_code
  from public.campuses
  where id = v_campus_id;

  -- Year+month in Monterrey time (UTC-6, permanent)
  v_year_month := to_char(NEW.paid_at at time zone 'America/Monterrey', 'YYYYMM');

  -- Atomically increment and get new sequence number
  insert into public.campus_folio_counters (campus_id, year_month, last_seq)
  values (v_campus_id, v_year_month, 1)
  on conflict (campus_id, year_month) do update
    set last_seq = campus_folio_counters.last_seq + 1
  returning last_seq into v_seq;

  NEW.folio := v_campus_code || '-' || v_year_month || '-' || lpad(v_seq::text, 5, '0');
  return NEW;
end;
$$;
