-- guardians name and phone_primary are nullable
-- Real data has guardians identified only by phone, email, or name — not always all three
alter table public.guardians
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column phone_primary drop not null;
