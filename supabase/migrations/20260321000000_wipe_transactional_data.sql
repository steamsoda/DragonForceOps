-- FULL DATA WIPE — March 21, 2026
-- Truncates all transactional/operational tables.
-- Keeps all reference/config data intact:
--   campuses, pricing_plans, pricing_plan_tuition_rules, pricing_plan_items,
--   charge_types, products, product_categories, app_roles, user_roles, app_settings
--
-- PostgreSQL handles FK ordering automatically when all tables are listed
-- in a single TRUNCATE statement.
-- RESTART IDENTITY resets all sequences back to 1.

TRUNCATE
  public.payment_allocations,
  public.cash_session_entries,
  public.cash_sessions,
  public.uniform_orders,
  public.tournament_player_entries,
  public.tournament_team_entries,
  public.tournaments,
  public.team_assignments,
  public.audit_logs,
  public.payments,
  public.charges,
  public.enrollments,
  public.player_guardians,
  public.players,
  public.guardians,
  public.teams,
  public.coaches,
  public.academy_events,
  public.area_map_entries
RESTART IDENTITY CASCADE;
