-- Supabase advisor performance hardening.
-- Add covering indexes for the foreign keys reported by the production advisor.

create index if not exists "idx_fk_academy_events_created_by"
  on "public"."academy_events" ("created_by");

create index if not exists "idx_fk_app_settings_updated_by"
  on "public"."app_settings" ("updated_by");

create index if not exists "idx_fk_area_map_entries_created_by"
  on "public"."area_map_entries" ("created_by");

create index if not exists "idx_fk_attendance_closures_created_by"
  on "public"."attendance_closures" ("created_by");

create index if not exists "idx_fk_attendance_record_audit_actor_user_id"
  on "public"."attendance_record_audit" ("actor_user_id");

create index if not exists "idx_fk_attendance_record_audit_attendance_record_id"
  on "public"."attendance_record_audit" ("attendance_record_id");

create index if not exists "idx_fk_attendance_record_audit_session_id"
  on "public"."attendance_record_audit" ("session_id");

create index if not exists "idx_fk_attendance_records_enrollment_id"
  on "public"."attendance_records" ("enrollment_id");

create index if not exists "idx_fk_attendance_records_incident_id"
  on "public"."attendance_records" ("incident_id");

create index if not exists "idx_fk_attendance_records_recorded_by"
  on "public"."attendance_records" ("recorded_by");

create index if not exists "idx_fk_attendance_records_team_assignment_id"
  on "public"."attendance_records" ("team_assignment_id");

create index if not exists "idx_fk_attendance_records_training_group_assignment_id"
  on "public"."attendance_records" ("training_group_assignment_id");

create index if not exists "idx_fk_attendance_records_updated_by"
  on "public"."attendance_records" ("updated_by");

create index if not exists "idx_fk_attendance_schedule_templates_created_by"
  on "public"."attendance_schedule_templates" ("created_by");

create index if not exists "idx_fk_attendance_schedule_templates_team_id"
  on "public"."attendance_schedule_templates" ("team_id");

create index if not exists "idx_fk_attendance_schedule_templates_training_group_id"
  on "public"."attendance_schedule_templates" ("training_group_id");

create index if not exists "idx_fk_attendance_sessions_completed_by"
  on "public"."attendance_sessions" ("completed_by");

create index if not exists "idx_fk_attendance_sessions_created_by"
  on "public"."attendance_sessions" ("created_by");

create index if not exists "idx_fk_attendance_sessions_schedule_template_id"
  on "public"."attendance_sessions" ("schedule_template_id");

create index if not exists "idx_fk_audit_logs_actor_user_id"
  on "public"."audit_logs" ("actor_user_id");

create index if not exists "idx_fk_audit_logs_reversed_by"
  on "public"."audit_logs" ("reversed_by");

create index if not exists "idx_fk_cash_session_entries_created_by"
  on "public"."cash_session_entries" ("created_by");

create index if not exists "idx_fk_cash_session_entries_payment_id"
  on "public"."cash_session_entries" ("payment_id");

create index if not exists "idx_fk_cash_sessions_closed_by"
  on "public"."cash_sessions" ("closed_by");

create index if not exists "idx_fk_cash_sessions_opened_by"
  on "public"."cash_sessions" ("opened_by");

create index if not exists "idx_fk_charges_charge_type_id"
  on "public"."charges" ("charge_type_id");

create index if not exists "idx_fk_charges_created_by"
  on "public"."charges" ("created_by");

create index if not exists "idx_fk_charges_pricing_rule_id"
  on "public"."charges" ("pricing_rule_id");

create index if not exists "idx_fk_charges_product_id"
  on "public"."charges" ("product_id");

create index if not exists "idx_fk_corte_checkpoints_closed_by"
  on "public"."corte_checkpoints" ("closed_by");

create index if not exists "idx_fk_enrollment_incidents_cancelled_by"
  on "public"."enrollment_incidents" ("cancelled_by");

create index if not exists "idx_fk_enrollment_incidents_created_by"
  on "public"."enrollment_incidents" ("created_by");

create index if not exists "idx_fk_enrollments_contactado_by"
  on "public"."enrollments" ("contactado_by");

create index if not exists "idx_fk_enrollments_follow_up_by"
  on "public"."enrollments" ("follow_up_by");

create index if not exists "idx_fk_enrollments_pricing_plan_id"
  on "public"."enrollments" ("pricing_plan_id");

create index if not exists "idx_fk_payment_refunds_created_by"
  on "public"."payment_refunds" ("created_by");

create index if not exists "idx_fk_payments_created_by"
  on "public"."payments" ("created_by");

create index if not exists "idx_fk_player_measurement_sessions_recorded_by_user_id"
  on "public"."player_measurement_sessions" ("recorded_by_user_id");

create index if not exists "idx_fk_pricing_plan_items_charge_type_id"
  on "public"."pricing_plan_items" ("charge_type_id");

create index if not exists "idx_fk_product_training_group_restrictions_created_by"
  on "public"."product_training_group_restrictions" ("created_by");

create index if not exists "idx_fk_products_charge_type_id"
  on "public"."products" ("charge_type_id");

create index if not exists "idx_fk_tournament_source_teams_approved_by"
  on "public"."tournament_source_teams" ("approved_by");

create index if not exists "idx_fk_tournament_source_teams_default_squad_id"
  on "public"."tournament_source_teams" ("default_squad_id");

create index if not exists "idx_fk_tournaments_created_by"
  on "public"."tournaments" ("created_by");

create index if not exists "idx_fk_training_group_assignments_assigned_by"
  on "public"."training_group_assignments" ("assigned_by");

create index if not exists "idx_fk_training_group_coaches_coach_id"
  on "public"."training_group_coaches" ("coach_id");

create index if not exists "idx_fk_uniform_orders_created_by"
  on "public"."uniform_orders" ("created_by");

create index if not exists "idx_fk_user_roles_campus_id"
  on "public"."user_roles" ("campus_id");

create index if not exists "idx_fk_user_roles_role_id"
  on "public"."user_roles" ("role_id");
