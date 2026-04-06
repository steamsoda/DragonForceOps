alter table public.enrollments
  drop constraint if exists enrollments_dropout_reason_check;

alter table public.enrollments
  add constraint enrollments_dropout_reason_check
    check (
      dropout_reason is null or dropout_reason in (
        'cost',
        'distance',
        'injury',
        'attitude',
        'time',
        'level_change',
        'other',
        'coach_capability',
        'exercise_difficulty',
        'financial',
        'training_quality',
        'school_disorganization',
        'facility_safety',
        'transport',
        'family_health',
        'player_health',
        'schedule_conflict',
        'coach_communication',
        'wants_competition',
        'lack_of_information',
        'pedagogy',
        'moved_to_competition_club',
        'player_coach_relationship',
        'unattractive_exercises',
        'moved_residence',
        'school_performance_punishment',
        'home_behavior_punishment',
        'personal',
        'parent_work',
        'dislikes_football',
        'lost_contact',
        'low_peer_attendance',
        'changed_sport',
        'did_not_return',
        'temporary_leave',
        'moved_to_another_academy',
        'school_schedule_conflict',
        'coach_change',
        'cold_weather'
      )
    );
