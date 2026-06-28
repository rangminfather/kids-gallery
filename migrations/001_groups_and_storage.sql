-- =============================================================
-- Migration 001: Public gallery groups + R2 storage support
-- =============================================================
-- Run in Supabase Dashboard -> SQL Editor.
-- Idempotent (safe to re-run).

-- -------------------------------------------------------------
-- 1) Groups: a public-gallery cohort that families opt into.
--    A family can belong to AT MOST ONE group at a time.
-- -------------------------------------------------------------
create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  owner_family_id uuid not null references public.families(id) on delete cascade,
  join_code       text not null unique,
  created_at      timestamptz not null default now()
);

-- Single-group-per-family is enforced by family_id being the PK.
create table if not exists public.group_memberships (
  family_id  uuid primary key references public.families(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  joined_at  timestamptz not null default now()
);
create index if not exists idx_group_memberships_group on public.group_memberships(group_id);

-- -------------------------------------------------------------
-- 2) Artworks: storage abstraction for Supabase / Cloudflare R2.
-- -------------------------------------------------------------
alter table public.artworks
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_key text;

-- Backfill: extract bucket-relative key from existing public URLs so
-- the read path can become provider-aware uniformly.
update public.artworks
set storage_key = regexp_replace(
  private_image_path,
  '^.*/storage/v1/object/(public|sign)/artworks/',
  ''
)
where storage_provider = 'supabase'
  and storage_key is null
  and private_image_path is not null;

-- -------------------------------------------------------------
-- 3) Helper: short alphabet join-code generator.
-- -------------------------------------------------------------
create or replace function public.gen_join_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- -------------------------------------------------------------
-- 4) Group RPCs (all SECURITY DEFINER; permissions enforced inside).
-- -------------------------------------------------------------

-- Create a new group; caller's family becomes the owner + first member.
create or replace function public.create_group(p_name text, p_description text default null)
returns table(group_id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_group_id  uuid;
  v_code      text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.family_id into v_family_id
  from public.profiles p
  where p.user_id = v_uid;

  if v_family_id is null then
    raise exception 'NO_FAMILY_PROFILE';
  end if;

  if exists (select 1 from public.group_memberships gm where gm.family_id = v_family_id) then
    raise exception 'ALREADY_IN_GROUP';
  end if;

  if length(coalesce(trim(p_name), '')) < 2 then
    raise exception 'NAME_TOO_SHORT';
  end if;

  for _ in 1..5 loop
    v_code := public.gen_join_code();
    exit when not exists (select 1 from public.groups g where g.join_code = v_code);
  end loop;

  insert into public.groups(name, description, owner_family_id, join_code)
  values (trim(p_name), nullif(trim(p_description), ''), v_family_id, v_code)
  returning id into v_group_id;

  insert into public.group_memberships(family_id, group_id)
  values (v_family_id, v_group_id);

  return query
  select v_group_id, trim(p_name), v_code;
end;
$$;

-- Join an existing group via code.
create or replace function public.join_group(p_code text)
returns table(group_id uuid, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_group_id  uuid;
  v_group_name text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.family_id into v_family_id
  from public.profiles p
  where p.user_id = v_uid;

  if v_family_id is null then
    raise exception 'NO_FAMILY_PROFILE';
  end if;

  if exists (select 1 from public.group_memberships gm where gm.family_id = v_family_id) then
    raise exception 'ALREADY_IN_GROUP';
  end if;

  select g.id, g.name into v_group_id, v_group_name
  from public.groups g
  where g.join_code = upper(trim(p_code));

  if v_group_id is null then
    raise exception 'INVALID_CODE';
  end if;

  insert into public.group_memberships(family_id, group_id)
  values (v_family_id, v_group_id);

  return query
  select v_group_id, v_group_name;
end;
$$;

-- Leave the current group. Owner leaving deletes the group entirely.
create or replace function public.leave_group()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid              uuid := auth.uid();
  v_family_id        uuid;
  v_group_id         uuid;
  v_owner_family_id  uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.family_id into v_family_id
  from public.profiles p
  where p.user_id = v_uid;

  if v_family_id is null then
    raise exception 'NO_FAMILY_PROFILE';
  end if;

  select gm.group_id into v_group_id
  from public.group_memberships gm
  where gm.family_id = v_family_id;

  if v_group_id is null then
    return;
  end if;

  select g.owner_family_id into v_owner_family_id
  from public.groups g
  where g.id = v_group_id;

  delete from public.group_memberships where family_id = v_family_id;

  if v_owner_family_id = v_family_id then
    delete from public.groups where id = v_group_id;
  end if;
end;
$$;

-- Inspect my current group.
create or replace function public.get_my_group()
returns table(
  group_id     uuid,
  name         text,
  description  text,
  join_code    text,
  is_owner     boolean,
  member_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.family_id into v_family_id
  from public.profiles p
  where p.user_id = v_uid;

  if v_family_id is null then
    return;
  end if;

  return query
  select
    g.id,
    g.name,
    g.description,
    case when g.owner_family_id = v_family_id then g.join_code else null end,
    (g.owner_family_id = v_family_id),
    (select count(*)::int from public.group_memberships gm2 where gm2.group_id = g.id)
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  where gm.family_id = v_family_id;
end;
$$;

-- Public-gallery feed for the caller's group.
create or replace function public.get_group_gallery_artworks()
returns setof public.artworks
language sql
security definer
set search_path = public
as $$
  select a.*
  from public.artworks a
  join public.group_memberships gm on gm.family_id = a.family_id
  where gm.group_id = (
    select gm2.group_id
    from public.group_memberships gm2
    join public.profiles p on p.family_id = gm2.family_id
    where p.user_id = auth.uid()
  )
  and a.is_public = true
  and (a.public_until is null or a.public_until > now())
  order by a.created_at desc;
$$;

-- -------------------------------------------------------------
-- 5) Row-Level Security: members can read their group, owner sees roster.
--    All writes go through SECURITY DEFINER RPCs above.
-- -------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;

drop policy if exists groups_select_members on public.groups;
create policy groups_select_members on public.groups
  for select to authenticated
  using (
    exists (
      select 1
      from public.group_memberships gm
      join public.profiles p on p.family_id = gm.family_id
      where gm.group_id = groups.id and p.user_id = auth.uid()
    )
  );

drop policy if exists memberships_select_visible on public.group_memberships;
create policy memberships_select_visible on public.group_memberships
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.family_id = group_memberships.family_id and p.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.groups g
      join public.profiles p on p.family_id = g.owner_family_id
      where g.id = group_memberships.group_id and p.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 6) Grants
-- -------------------------------------------------------------
grant execute on function public.create_group(text, text)             to authenticated;
grant execute on function public.join_group(text)                     to authenticated;
grant execute on function public.leave_group()                        to authenticated;
grant execute on function public.get_my_group()                       to authenticated;
grant execute on function public.get_group_gallery_artworks()         to authenticated;
