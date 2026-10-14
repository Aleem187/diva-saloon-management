-- =============================================================================
-- Nobody can promote themselves through their own profile row
--
-- `profiles_update_self` lets anyone update their own row, which is how a person
-- changes their name and phone. The guard trigger behind it stopped them
-- changing their own LEGACY `role` and their active flag, and anyone moving
-- tenant -- but not the columns that actually carry authority now:
--
--   role_id         what the login may do. A receptionist could set it to the
--                   Accountant role (or any custom role with more modules) with
--                   a single request to the data API, and gain payroll.
--   team_member_id  whose roster entry, commission and earnings are theirs.
--                   Pointing it at someone else's entry reads and attributes
--                   work as that person.
--   email           a copy of the Auth email, used to spot duplicate logins.
--
-- The page only ever sent name and phone, so nothing in the app did this; the
-- policy is what allowed it, and the rule belongs in Postgres, not the form.
--
-- Anyone with the Team module may still manage OTHER people's role and roster
-- link (that is what the Team screens do), and may link their own login to
-- their own roster entry. Changing your own role_id is refused for everyone.
-- The service role (auth.uid() is null) is unaffected, which is how the signup
-- trigger and the Auth admin API keep working.
-- =============================================================================

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.salon_id is distinct from old.salon_id then
    raise exception 'A user cannot be moved between salons';
  end if;

  if new.id is distinct from old.id then
    raise exception 'Profile id is immutable';
  end if;

  -- Nobody changes their own role or reactivates themselves, owners included.
  if new.id = (select auth.uid()) then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;
    if new.role_id is distinct from old.role_id then
      raise exception 'You cannot change your own role';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'You cannot change your own active status';
    end if;
    if new.email is distinct from old.email then
      raise exception 'You cannot change your own email here';
    end if;
    -- The roster link decides whose earnings and commission these are. Only
    -- someone who manages the team may set it, even on their own login.
    if new.team_member_id is distinct from old.team_member_id
       and not public.has_module('team') then
      raise exception 'You cannot change which team member you are';
    end if;
  end if;

  return new;
end;
$$;
