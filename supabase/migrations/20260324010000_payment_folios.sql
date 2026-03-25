-- ─────────────────────────────────────────────────────────────────────────────
-- Sequential folio numbers for payments
-- Format: {CAMPUS_CODE}-{YYYYMM}-{5-digit seq}  e.g. LV-202603-00042
-- Counter resets monthly per campus.
-- ─────────────────────────────────────────────────────────────────────────────

-- Counter table: one row per campus per calendar month
create table public.campus_folio_counters (
  campus_id  uuid not null references public.campuses(id) on delete cascade,
  year_month text not null,  -- 'YYYYMM' e.g. '202603'
  last_seq   int  not null default 0,
  primary key (campus_id, year_month)
);

-- Add folio column to payments (nullable so existing rows are unaffected)
alter table public.payments add column folio text unique;

-- ── Trigger function ──────────────────────────────────────────────────────────
create or replace function public.assign_payment_folio()
returns trigger language plpgsql as $$
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

create trigger trg_assign_payment_folio
  before insert on public.payments
  for each row execute function public.assign_payment_folio();
