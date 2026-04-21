-- Role permissions stabilization
-- Keeps live role bootstrap, nutrition-safe data, and intake pricing reads aligned
-- with the app-layer permission model.

drop policy if exists nutritionist_read_app_roles on public.app_roles;
create policy nutritionist_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_nutritionist());

drop policy if exists nutritionist_read_own_user_roles on public.user_roles;
create policy nutritionist_read_own_user_roles on public.user_roles
  for select to authenticated
  using (
    public.is_nutritionist()
    and user_id = auth.uid()
  );

drop policy if exists nutritionist_read_player_guardians on public.player_guardians;
create policy nutritionist_read_player_guardians on public.player_guardians
  for select to authenticated
  using (
    public.is_nutritionist()
    and public.current_user_can_access_nutrition_player(player_id)
  );

drop policy if exists nutritionist_read_guardians on public.guardians;
create policy nutritionist_read_guardians on public.guardians
  for select to authenticated
  using (
    public.is_nutritionist()
    and exists (
      select 1
      from public.player_guardians pg
      where pg.guardian_id = guardians.id
        and public.current_user_can_access_nutrition_player(pg.player_id)
    )
  );

drop policy if exists front_desk_read_pricing_plan_items on public.pricing_plan_items;
create policy front_desk_read_pricing_plan_items on public.pricing_plan_items
  for select to authenticated
  using (public.is_front_desk());

drop policy if exists front_desk_read_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules;
create policy front_desk_read_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules
  for select to authenticated
  using (public.is_front_desk());
