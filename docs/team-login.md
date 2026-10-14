# Team login (shared sign-in, 3 devices)

One shared login per salon, for a front-desk tablet or similar. Set up by the owner under **Team › Team login**.

## How it works
- The owner gives an email, a non-owner role and a password. The account is created like an invitation (so `handle_new_user` builds its profile with that role and no roster entry) and marked in `team_logins`.
- People sign in on the normal `/login` with that email and the team password.
- **At most 3 devices at once.** Sign-in claims a place through `claim_team_session()`; the device keeps a random key in an httpOnly cookie (`team_session`), and the database stores only its SHA-256 in `team_login_sessions`. A device counts while it has been seen within 30 minutes (`team_logins.idle_minutes`), so an idle tablet frees its place by itself.
- Every dashboard render and Server Action re-checks the place (`getSessionContext`). A device over the limit, signed out by the owner, or without its key is sent to `/auth/team-ended`, which signs it out (this device only) and shows why on `/login`.
- Signing out (`/auth/signout`) ends this device only and frees its place. The owner can sign one device, or every device, out; changing the team password signs every device out.

## Rules it keeps
- The team login is never the owner role, and must not hold the Team module (so a shared password cannot edit roles or invite accounts). Both are checked server-side; the database also refuses the owner.
- The password is never logged. Audit: `team_login.created`, `.password_changed`, `.sessions_revoked`, `.limit_reached`.
- Everyone on it looks the same in the audit log ("Team login") and cannot earn commission under their own name. Use personal logins for attributed work.

## What it cannot do
The cap is enforced by the app against rows in Postgres. Someone who already holds the login's access token can still call the database API directly until that token expires; Postgres does not know which device a token came from. Keep the password to the people it is for, and rotate it when someone leaves.

## Checking it (needs migration 20261014000041 applied)
1. Owner: Team › Team login › create with a role such as Receptionist.
2. Sign in as the team login on three browsers: all three succeed. A fourth is refused on `/login` with the 3-device message, and an audit entry "Team login refused" appears.
3. Owner signs one device out: that device is sent to `/login` with the signed-out message at its next click, and the fourth browser can now sign in.
4. Sign out on one device: the others stay signed in.
5. Change the team password: every device is signed out; the old password no longer works.
6. As the team login, confirm the Team page and owner-only areas are not reachable.
7. `npm run test:rls` and `npm run test:cascade` pass.
