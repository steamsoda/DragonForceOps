create table public.explicit_recovery_resolutions (
  kind text not null check(kind in ('cart','credit')), request_id uuid not null,
  enrollment_id uuid not null references public.enrollments(id),
  original_actor_id uuid not null references auth.users(id), resolved_by uuid not null references auth.users(id),
  reason text not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(kind,request_id)
);
alter table public.explicit_recovery_resolutions enable row level security;
revoke all on public.explicit_recovery_resolutions from public,anon,authenticated;
grant select on public.explicit_recovery_resolutions to service_role;

create function public.list_explicit_pending_operations(p_enrollment uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if auth.role() is distinct from 'authenticated' or not exists(select 1 from auth.users where id=actor
    and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor and r.code in ('superadmin','director_admin','director_readonly'))
    or exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor and r.code='porto_viewer') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.enrollments where id=p_enrollment) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',i.kind,'requestId',i.id,'actorEmail',coalesce(u.email,i.actor_id::text),
    'createdAt',i.created_at,'committed',i.committed,'canResolve',i.committed or i.created_at<=now()-interval '2 minutes') order by i.created_at),'[]'::jsonb)
  into result from (
    select 'cart' kind,c.id,c.actor_id,c.created_at,exists(select 1 from public.explicit_cart_checkouts x where x.id=c.id and x.enrollment_id=c.enrollment_id and x.actor_id=c.actor_id) committed
      from public.explicit_cart_intents c where c.enrollment_id=p_enrollment and c.state='pending'
    union all
    select 'credit',c.id,c.actor_id,c.created_at,exists(select 1 from public.explicit_credit_operations x where x.id=c.id and x.enrollment_id=c.enrollment_id and x.actor_id=c.actor_id)
      from public.explicit_credit_intents c where c.enrollment_id=p_enrollment and c.state='pending'
  ) i left join auth.users u on u.id=i.actor_id;
  return jsonb_build_object('pending',result,'history',coalesce((select jsonb_agg(h.entry order by h.created_at desc) from (
    select jsonb_build_object('kind',r.kind,'requestId',r.request_id,'reason',r.reason,'resolvedAt',r.created_at,'result',r.result) entry,r.created_at
      from public.explicit_recovery_resolutions r where r.enrollment_id=p_enrollment order by r.created_at desc limit 10
  ) h),'[]'::jsonb));
end $$;

create function public.resolve_explicit_pending_operation(p_enrollment uuid,p_kind text,p_request uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); original_actor uuid; started timestamptz; intent_state text; saved jsonb; result jsonb;
begin
  if auth.role() is distinct from 'authenticated' or not exists(select 1 from auth.users where id=actor
    and email_confirmed_at is not null and (banned_until is null or banned_until<=now()))
    or not exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor and r.code in ('superadmin','director_admin'))
    or exists(select 1 from public.user_roles u join public.app_roles r on r.id=u.role_id where u.user_id=actor and r.code in ('director_readonly','porto_viewer')) then raise exception 'forbidden'; end if;
  if p_kind is null or p_kind not in ('cart','credit') or p_request is null
    or length(btrim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'invalid_resolution'; end if;
  -- Same lock as checkout/application: wait for an in-flight transaction before
  -- deciding whether a receipt exists. Never infer failure from a missing response.
  perform 1 from public.enrollments where id=p_enrollment for update;
  if not found then raise exception 'forbidden'; end if;
  select r.result into result from public.explicit_recovery_resolutions r
    where r.kind=p_kind and r.request_id=p_request and r.enrollment_id=p_enrollment;
  if found then return result; end if;
  if p_kind='cart' then
    select c.actor_id,c.created_at,c.state into original_actor,started,intent_state
      from public.explicit_cart_intents c where c.id=p_request and c.enrollment_id=p_enrollment;
    if not found then raise exception 'operation_not_found'; end if;
    select x.receipt into saved from public.explicit_cart_checkouts x where x.id=p_request and x.enrollment_id=p_enrollment and x.actor_id=original_actor;
  else
    select c.actor_id,c.created_at,c.state into original_actor,started,intent_state
      from public.explicit_credit_intents c where c.id=p_request and c.enrollment_id=p_enrollment;
    if not found then raise exception 'operation_not_found'; end if;
    select x.receipt into saved from public.explicit_credit_operations x where x.id=p_request and x.enrollment_id=p_enrollment and x.actor_id=original_actor;
  end if;
  if intent_state<>'pending' then raise exception 'operation_already_resolved'; end if;
  if saved is null and ((p_kind='cart' and exists(select 1 from public.explicit_cart_checkouts where id=p_request))
    or (p_kind='credit' and exists(select 1 from public.explicit_credit_operations where id=p_request))) then raise exception 'operation_receipt_mismatch'; end if;
  if saved is null and started>now()-interval '2 minutes' then raise exception 'operation_too_recent'; end if;
  if saved is not null and ((saved->>'operationId')::uuid is distinct from p_request or (saved->>'enrollmentId')::uuid is distinct from p_enrollment) then raise exception 'operation_receipt_mismatch'; end if;
  result:=jsonb_build_object('kind',p_kind,'requestId',p_request,'outcome',case when saved is null then 'cancelled_uncommitted' else 'receipt_recovered' end,'receipt',saved);
  if p_kind='cart' then
    update public.explicit_cart_intents set state=case when saved is null then 'failed' else 'completed' end where id=p_request;
  else
    update public.explicit_credit_intents set state=case when saved is null then 'failed' else 'completed' end where id=p_request;
  end if;
  insert into public.explicit_recovery_resolutions(kind,request_id,enrollment_id,original_actor_id,resolved_by,reason,result)
    values(p_kind,p_request,p_enrollment,original_actor,actor,btrim(p_reason),result);
  return result;
end $$;
revoke all on function public.list_explicit_pending_operations(uuid),public.resolve_explicit_pending_operation(uuid,text,uuid,text) from public,anon;
grant execute on function public.list_explicit_pending_operations(uuid),public.resolve_explicit_pending_operation(uuid,text,uuid,text) to authenticated;
