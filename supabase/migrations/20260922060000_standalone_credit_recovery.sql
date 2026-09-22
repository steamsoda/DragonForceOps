create table public.explicit_credit_intents (
  id uuid primary key, enrollment_id uuid not null references public.enrollments(id),
  actor_id uuid not null references auth.users(id), command jsonb not null,
  state text not null default 'pending' check(state in ('pending','completed','failed')),
  created_at timestamptz not null default now()
);
create unique index explicit_credit_one_pending on public.explicit_credit_intents(enrollment_id) where state='pending';
alter table public.explicit_credit_intents enable row level security;
revoke all on public.explicit_credit_intents from public,anon,authenticated;
grant select on public.explicit_credit_intents to service_role;

create function public.stage_explicit_credit(p_enrollment uuid,p_request uuid,p_command jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); e public.enrollments; prior public.explicit_credit_intents;
begin
  if auth.role() is distinct from 'authenticated' or not exists(select 1 from auth.users where id=actor
    and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'forbidden'; end if;
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found then raise exception 'forbidden'; end if;
  if exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor and r.code in ('director_readonly','porto_viewer'))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor
      and (r.code in ('superadmin','director_admin') or (r.code='front_desk' and u.campus_id=e.campus_id))) then raise exception 'forbidden'; end if;
  if p_request is null or jsonb_typeof(p_command) is distinct from 'object'
    or (p_command->>'requestId')::uuid is distinct from p_request
    or (p_command->>'enrollmentId')::uuid is distinct from e.id
    or jsonb_typeof(p_command->'selection') is distinct from 'array' then raise exception 'invalid_credit_selection'; end if;
  if p_command-array['enrollmentId','requestId','expectedAvailable','selection']<>'{}'::jsonb
    or jsonb_typeof(p_command->'expectedAvailable') is distinct from 'number'
    or (p_command->>'expectedAvailable')::numeric<=0 or (p_command->>'expectedAvailable')::numeric>=10000000000
    or round((p_command->>'expectedAvailable')::numeric,2)<>(p_command->>'expectedAvailable')::numeric
    or jsonb_array_length(p_command->'selection') not between 1 and 100 then raise exception 'invalid_credit_selection'; end if;
  if exists(select 1 from jsonb_array_elements(p_command->'selection') s where
      jsonb_typeof(s) is distinct from 'object' or s-array['chargeId','amount','expectedPending']<>'{}'::jsonb
      or jsonb_typeof(s->'chargeId') is distinct from 'string' or (s->>'chargeId')::uuid is null
      or jsonb_typeof(s->'amount') is distinct from 'number' or jsonb_typeof(s->'expectedPending') is distinct from 'number'
      or (s->>'amount')::numeric<=0 or (s->>'expectedPending')::numeric>=10000000000
      or (s->>'amount')::numeric>(s->>'expectedPending')::numeric
      or round((s->>'amount')::numeric,2)<>(s->>'amount')::numeric
      or round((s->>'expectedPending')::numeric,2)<>(s->>'expectedPending')::numeric)
    or (select count(distinct (s->>'chargeId')::uuid) from jsonb_array_elements(p_command->'selection') s)<>jsonb_array_length(p_command->'selection')
    or (select sum((s->>'amount')::numeric) from jsonb_array_elements(p_command->'selection') s)>(p_command->>'expectedAvailable')::numeric then raise exception 'invalid_credit_selection'; end if;
  select * into prior from public.explicit_credit_intents where id=p_request;
  if found then
    if prior.actor_id<>actor or prior.enrollment_id<>e.id or prior.command<>p_command then raise exception 'credit_request_conflict'; end if;
    if prior.state='failed' then raise exception 'credit_selection_changed'; end if;
    return;
  end if;
  if exists(select 1 from public.explicit_credit_intents where enrollment_id=e.id and state='pending')
    or exists(select 1 from public.explicit_cart_intents where enrollment_id=e.id and state='pending') then raise exception 'credit_in_progress'; end if;
  insert into public.explicit_credit_intents(id,enrollment_id,actor_id,command) values(p_request,e.id,actor,p_command);
end $$;

create function public.resolve_explicit_credit_intent(p_request uuid,p_failed boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare intent public.explicit_credit_intents;
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'forbidden'; end if;
  select * into intent from public.explicit_credit_intents where id=p_request and actor_id=auth.uid();
  if not found then return; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))
    or exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=auth.uid() and r.code in ('director_readonly','porto_viewer'))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id join public.enrollments e on e.id=intent.enrollment_id
      where u.user_id=auth.uid() and (r.code in ('superadmin','director_admin') or (r.code='front_desk' and u.campus_id=e.campus_id))) then raise exception 'forbidden'; end if;
  -- Wait for any in-flight application before deciding whether it committed.
  perform 1 from public.enrollments where id=intent.enrollment_id for update;
  if p_failed then
    update public.explicit_credit_intents set state='failed' where id=p_request
      and not exists(select 1 from public.explicit_credit_operations where id=p_request);
  else
    update public.explicit_credit_intents set state='completed' where id=p_request
      and exists(select 1 from public.explicit_credit_operations where id=p_request and actor_id=auth.uid());
  end if;
end $$;
revoke all on function public.stage_explicit_credit(uuid,uuid,jsonb),public.resolve_explicit_credit_intent(uuid,boolean) from public,anon;
grant execute on function public.stage_explicit_credit(uuid,uuid,jsonb),public.resolve_explicit_credit_intent(uuid,boolean) to authenticated;

do $$ declare definition text; marker text; begin
  definition:=pg_get_functiondef('public.apply_explicit_credit_selection(uuid,uuid,jsonb,numeric)'::regprocedure);
  marker:='perform 1 from public.charges where id=any(ids) order by id for update;';
  if strpos(definition,marker)=0 then raise exception 'credit_recovery_drift'; end if;
  definition:=replace(definition,marker,'if exists(select 1 from public.explicit_credit_intents where id=p_request and state=''failed'') then raise exception ''credit_selection_changed''; end if;
    if exists(select 1 from public.explicit_credit_intents where id=p_request and (actor_id<>actor or enrollment_id<>e.id or command->''selection''<>p_selection or (command->>''expectedAvailable'')::numeric<>p_expected_available)) then raise exception ''credit_request_conflict''; end if;
    if exists(select 1 from public.explicit_credit_intents where enrollment_id=e.id and state=''pending'' and (id<>p_request or actor_id<>actor))
      or exists(select 1 from public.explicit_cart_intents where enrollment_id=e.id and state=''pending'') then raise exception ''credit_in_progress''; end if; '||marker);
  execute definition;
  definition:=pg_get_functiondef('public.stage_explicit_cart(uuid,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
  marker:='insert into public.explicit_cart_intents';
  if strpos(definition,marker)=0 then raise exception 'cart_credit_recovery_drift'; end if;
  execute replace(definition,marker,'if exists(select 1 from public.explicit_credit_intents where enrollment_id=e.id and state=''pending'') then raise exception ''checkout_in_progress''; end if; '||marker);
  definition:=pg_get_functiondef('public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
  marker:='cmd:=p_payload->''command'';';
  if strpos(definition,marker)=0 then raise exception 'checkout_credit_recovery_drift'; end if;
  execute replace(definition,marker,'if exists(select 1 from public.explicit_credit_intents where enrollment_id=e.id and state=''pending'') then raise exception ''checkout_in_progress''; end if; '||marker);
end $$;
