-- Trial classes pass 3: durable, one-to-one source link into the existing
-- enrollment intake flow. The column is nullable so normal enrollments are
-- completely unchanged.

alter table public.enrollments
  add column if not exists source_trial_prospect_id uuid null
    references public.trial_prospects(id) on delete set null;

create unique index if not exists uq_enrollments_source_trial_prospect
  on public.enrollments(source_trial_prospect_id)
  where source_trial_prospect_id is not null;

comment on column public.enrollments.source_trial_prospect_id is
  'Optional pre-enrollment trial prospect that was converted through the normal enrollment intake flow.';
