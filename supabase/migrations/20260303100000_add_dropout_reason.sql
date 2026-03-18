-- Add dropout tracking fields to enrollments.
-- dropout_reason: predefined code, required when status = 'ended' or 'cancelled'.
-- dropout_notes: free text, always optional (required by app layer when reason = 'other').

alter table public.enrollments
  add column if not exists dropout_reason text null,
  add column if not exists dropout_notes  text null;

-- Soft constraint via check: if provided, must be one of the known codes.
alter table public.enrollments
  add constraint enrollments_dropout_reason_check
    check (
      dropout_reason is null or dropout_reason in (
        'cost', 'distance', 'injury', 'attitude', 'time', 'level_change', 'other'
      )
    );
