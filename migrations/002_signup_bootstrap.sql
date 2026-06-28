-- =============================================================
-- Migration 002: Signup bootstrap RPC
-- =============================================================
-- After signup + email confirm, the client calls ensure_my_profile()
-- to make a families row + profiles row in one shot. Idempotent.

create or replace function public.ensure_my_profile(p_family_name text default null)
returns table(family_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_created   boolean := false;
  v_name      text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.family_id into v_family_id
  from public.profiles p
  where p.user_id = v_uid;

  if v_family_id is null then
    v_name := nullif(trim(coalesce(p_family_name, '')), '');
    insert into public.families(name)
    values (coalesce(v_name, '우리 가족'))
    returning id into v_family_id;

    insert into public.profiles(user_id, family_id)
    values (v_uid, v_family_id);

    v_created := true;
  end if;

  return query select v_family_id, v_created;
end;
$$;

grant execute on function public.ensure_my_profile(text) to authenticated;
