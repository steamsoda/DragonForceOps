-- Speed up attendance submit/detail roster snapshots without changing write semantics.

create index if not exists idx_training_group_assignments_attendance_lookup
  on public.training_group_assignments (training_group_id, start_date, end_date, enrollment_id);

create index if not exists idx_team_assignments_attendance_lookup
  on public.team_assignments (team_id, is_primary, start_date, end_date, enrollment_id);

create index if not exists idx_enrollment_incidents_attendance_active_lookup
  on public.enrollment_incidents (enrollment_id, incident_type, starts_on, ends_on)
  where cancelled_at is null
    and incident_type in ('injury', 'absence');
