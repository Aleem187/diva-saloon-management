-- =============================================================================
-- Team login: one shared sign-in per salon, capped at 3 active sessions
--
-- A salon may set up ONE shared login (a front-desk tablet, say) tied to an
-- ordinary non-owner role. Anyone holding its password signs in as that
-- account. Because several people then share one identity, two things follow:
--
--   1. The login is marked here (team_logins), so the app knows to police it.
--   2. At most `max_sessions` (3) devices may be signed in with it at once.
--      Each device holds a random key in an httpOnly cookie; only the SHA-256
--      of it is stored here, in team_login_sessions. A session counts while it
--      has been seen within `idle_minutes`, so a tablet left on a shelf frees
--      its place by itself.
--
-- Who may touch what:
--   team_logins          read   the owner, and the team login itself
--                        write  the owner only (insert / delete)
--   team_login_sessions  read   the owner only
--                        write  nobody directly: the three functions below
--
-- What this enforces, and what it cannot. The check runs in the app on every
-- dashboard request and Server Action (getSessionContext), against the rows
-- here, so a device over the limit, or one the owner has signed out, is refused
-- and signed out. It does NOT stop someone who already holds the login's access
-- token from calling the database API directly until that token expires:
-- Supabase issues the token, and Postgres does not know which session it came
-- from. The limit is a control on the product's use, not a replacement for
-- keeping the password to the people it is meant for.
--
-- Rule 8 (CLAUDE.md): each table has its OWN salon_id referencing salons on
-- delete cascade. Rule 1: foreign keys to other tenant tables are composite.
-- =============================================================================

create table public.team_logins (
  profile_id    uuid primary key,
  salon_id      uuid not null references public.salons (id) on delete cascade,
  created_by    uuid,
  -- The cap. A column rather than a literal in the function, so the rule is
  -- data; the check keeps it from being raised past the product's limit of 3.
  max_sessions  smallint not null default 3 check (max_sessions between 1 and 3),
  -- A session not seen for this long stops counting towards the cap.
  idle_minutes  smallint not null default 30 check (idle_minutes between 5 and 1440),
  created_at    timestamptz not null default now(),
  unique (salon_id),
  foreign key (profile_id, salon_id)
    references public.profiles (id, salon_id) on delete cascade,
  foreign key (created_by, salon_id)
    references public.profiles (id, salon_id) on delete set null (created_by)
);

comment on table public.team_logins is
  'The salon''s one shared login. Its sessions are capped (max_sessions) and listed in team_login_sessions.';

create table public.team_login_sessions (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null references public.salons (id) on delete cascade,
  profile_id    uuid not null,
  -- SHA-256 (hex) of the cookie value; the cookie itself is never stored.
  key_hash      text not null,
  user_agent    text not null default '',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (profile_id, key_hash),
  foreign key (profile_id, salon_id)
    references public.profiles (id, salon_id) on delete cascade
);

create index team_login_sessions_profile_seen_idx
  on public.team_login_sessions (profile_id, last_seen_at desc);

-- -----------------------------------------------------------------------------
-- The shared login is never the owner: it would cap the owner's own sessions
-- and put owner-only areas behind a password many people know.
-- -----------------------------------------------------------------------------
create or replace function public.guard_team_login_not_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id and r.salon_id = p.salon_id
    where p.id = new.profile_id and r.is_owner
  ) then
    raise exception 'The owner cannot be the shared team login'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger team_logins_guard_not_owner
  before insert on public.team_logins
  for each row execute function public.guard_team_login_not_owner();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.team_logins enable row level security;
alter table public.team_login_sessions enable row level security;

create policy team_logins_select_owner_or_self
  on public.team_logins for select to authenticated
  using (
    salon_id = public.current_salon_id()
    and (public.is_owner() or profile_id = (select auth.uid()))
  );

create policy team_logins_insert_owner
  on public.team_logins for insert to authenticated
  with check (salon_id = public.current_salon_id() and public.is_owner());

create policy team_logins_delete_owner
  on public.team_logins for delete to authenticated
  using (salon_id = public.current_salon_id() and public.is_owner());

create policy team_login_sessions_select_owner
  on public.team_login_sessions for select to authenticated
  using (salon_id = public.current_salon_id() and public.is_owner());

-- No insert, update or delete policy on team_login_sessions, and none for
-- update on team_logins: sessions change only through the functions below.

-- -----------------------------------------------------------------------------
-- claim_team_session(key_hash, user_agent)
--
-- Called by the team login's own device on sign-in and on every request after.
-- Returns:
--   'ok'        this device holds (or has just taken) one of the places
--   'limit'     all places are in use by other devices
--   'revoked'   the owner signed this device out
--   'not_team'  the caller is not the team login, so nothing here applies
--
-- The advisory lock serialises claims for one login, so two devices signing in
-- at the same instant cannot both see "2 in use" and both take the third place.
-- -----------------------------------------------------------------------------
create or replace function public.claim_team_session(p_key_hash text, p_user_agent text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_login   public.team_logins%rowtype;
  v_row     public.team_login_sessions%rowtype;
  v_exists  boolean;
  v_active  integer;
begin
  if v_uid is null or coalesce(p_key_hash, '') = '' then
    return 'not_team';
  end if;

  select * into v_login from public.team_logins where profile_id = v_uid;
  if not found then
    return 'not_team';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Housekeeping: a month-old row is long past counting for anything.
  delete from public.team_login_sessions
  where profile_id = v_uid and last_seen_at < now() - interval '30 days';

  select * into v_row
  from public.team_login_sessions
  where profile_id = v_uid and key_hash = p_key_hash;
  v_exists := found;

  if v_exists and v_row.revoked_at is not null then
    return 'revoked';
  end if;

  select count(*) into v_active
  from public.team_login_sessions s
  where s.profile_id = v_uid
    and s.revoked_at is null
    and s.last_seen_at > now() - make_interval(mins => v_login.idle_minutes)
    and s.id is distinct from v_row.id;

  if v_active >= v_login.max_sessions then
    return 'limit';
  end if;

  if v_exists then
    update public.team_login_sessions set last_seen_at = now() where id = v_row.id;
  else
    insert into public.team_login_sessions (salon_id, profile_id, key_hash, user_agent)
    values (v_login.salon_id, v_uid, p_key_hash, left(coalesce(p_user_agent, ''), 300));
  end if;

  return 'ok';
end;
$$;

-- -----------------------------------------------------------------------------
-- release_team_session(key_hash): the device signing itself out frees its place.
-- -----------------------------------------------------------------------------
create or replace function public.release_team_session(p_key_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.team_login_sessions
  where profile_id = (select auth.uid()) and key_hash = p_key_hash;
$$;

-- -----------------------------------------------------------------------------
-- revoke_team_sessions(session_id): owner only. NULL signs every device out.
-- A signed-out device is refused at its next request, and its place is free at
-- once. Returns how many were signed out.
-- -----------------------------------------------------------------------------
create or replace function public.revoke_team_sessions(p_session_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can sign team devices out'
      using errcode = '42501';
  end if;

  update public.team_login_sessions
  set revoked_at = now()
  where salon_id = public.current_salon_id()
    and revoked_at is null
    and (p_session_id is null or id = p_session_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.claim_team_session(text, text) from public;
revoke execute on function public.release_team_session(text) from public;
revoke execute on function public.revoke_team_sessions(uuid) from public;
revoke execute on function public.guard_team_login_not_owner() from public;
grant execute on function public.claim_team_session(text, text) to authenticated, service_role;
grant execute on function public.release_team_session(text) to authenticated, service_role;
grant execute on function public.revoke_team_sessions(uuid) to authenticated, service_role;
