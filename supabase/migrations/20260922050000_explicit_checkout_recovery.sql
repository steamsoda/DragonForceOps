create table public.explicit_cart_intents (
  id uuid primary key, enrollment_id uuid not null references public.enrollments(id),
  actor_id uuid not null references auth.users(id), campus_id uuid not null references public.campuses(id),
  payload jsonb not null, recovery jsonb not null,
  state text not null default 'pending' check(state in ('pending','completed','failed')),
  created_at timestamptz not null default now()
);
create unique index explicit_cart_one_pending_account on public.explicit_cart_intents(enrollment_id) where state='pending';
alter table public.explicit_cart_intents enable row level security;
revoke all on public.explicit_cart_intents from public,anon,authenticated;
grant select on public.explicit_cart_intents to service_role;

create function public.stage_explicit_cart(p_actor uuid,p_enrollment uuid,p_campus uuid,p_request uuid,p_payload jsonb,p_recovery jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments; prior public.explicit_cart_intents;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from auth.users where id=p_actor
    and email_confirmed_at is not null and (banned_until is null or banned_until<=now())) then raise exception 'forbidden'; end if;
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found then raise exception 'forbidden'; end if;
  if exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=p_actor and r.code in ('director_readonly','porto_viewer'))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=p_actor and
      (r.code in ('superadmin','director_admin') or (r.code='front_desk' and u.campus_id=e.campus_id and u.campus_id=p_campus))) then raise exception 'forbidden'; end if;
  if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_recovery) is distinct from 'object' then raise exception 'invalid_checkout'; end if;
  select * into prior from public.explicit_cart_intents where id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.enrollment_id<>e.id or prior.campus_id<>p_campus or prior.payload<>p_payload then raise exception 'checkout_request_conflict'; end if;
    if prior.state='failed' then raise exception 'checkout_changed'; end if;
    return;
  end if;
  if e.status<>'active' then raise exception 'enrollment_inactive'; end if;
  if exists(select 1 from public.explicit_cart_intents where enrollment_id=e.id and state='pending') then raise exception 'checkout_in_progress'; end if;
  insert into public.explicit_cart_intents(id,enrollment_id,actor_id,campus_id,payload,recovery)
    values(p_request,e.id,p_actor,p_campus,p_payload,p_recovery);
end $$;

create function public.fail_explicit_cart_intent(p_actor uuid,p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare intent public.explicit_cart_intents;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  select * into intent from public.explicit_cart_intents where id=p_request and actor_id=p_actor;
  if not found then return; end if;
  -- Serialize with a checkout still in flight before deciding there was no write.
  perform 1 from public.enrollments where id=intent.enrollment_id for update;
  update public.explicit_cart_intents set state='failed' where id=p_request
    and not exists(select 1 from public.explicit_cart_checkouts where id=p_request);
end $$;

create function public.acknowledge_explicit_cart(p_actor uuid,p_request uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden'; end if;
  update public.explicit_cart_intents set state='completed' where id=p_request and actor_id=p_actor
    and exists(select 1 from public.explicit_cart_checkouts where id=p_request and actor_id=p_actor);
end $$;
revoke all on function public.acknowledge_explicit_cart(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_explicit_cart(uuid,uuid) to service_role;
revoke all on function public.stage_explicit_cart(uuid,uuid,uuid,uuid,jsonb,jsonb),public.fail_explicit_cart_intent(uuid,uuid) from public,anon,authenticated;
grant execute on function public.stage_explicit_cart(uuid,uuid,uuid,uuid,jsonb,jsonb),public.fail_explicit_cart_intent(uuid,uuid) to service_role;

do $$ declare definition text; marker text; begin
  definition:=pg_get_functiondef('public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
  marker:='select * into prior from public.explicit_cart_checkouts where id=p_request;';
  if strpos(definition,marker)=0 then raise exception 'checkout_recovery_drift'; end if;
  definition:=replace(definition,marker,'if exists(select 1 from public.explicit_cart_intents where id=p_request and state=''failed'') then raise exception ''checkout_changed''; end if; '||marker);
  -- Returning an immutable receipt is not a new payment. Retain current actor
  -- and campus authorization, but allow recovery after an enrollment ends.
  marker:='if not found or e.status<>''active'' then raise exception ''enrollment_inactive''; end if;';
  if strpos(definition,marker)=0 then raise exception 'checkout_active_guard_drift'; end if;
  definition:=replace(definition,marker,'if not found then raise exception ''enrollment_inactive''; end if;');
  marker:='cmd:=p_payload->''command'';';
  if strpos(definition,marker)=0 then raise exception 'checkout_command_guard_drift'; end if;
  definition:=replace(definition,marker,'if e.status<>''active'' then raise exception ''enrollment_inactive''; end if; '||marker);
  execute definition;
end $$;
