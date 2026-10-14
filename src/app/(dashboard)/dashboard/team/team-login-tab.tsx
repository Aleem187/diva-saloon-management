import { revokeTeamSessionAction } from "./team-login-actions";
import { ChangeTeamPasswordForm, CreateTeamLoginForm } from "./team-login-forms";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/auth/session";
import { describeDevice } from "@/lib/auth/team-login";
import { createClient } from "@/lib/supabase/server";
import { formatInstantInSalon } from "@/lib/time";
import type {
  ProfileRow,
  RoleRow,
  TeamLoginRow,
  TeamLoginSessionRow,
} from "@/lib/types/database";

/** The request's clock, read in a plain function: a server component reads it once per request. */
function currentTimeMs(): number {
  return Date.now();
}

/** Team › Team login: one shared sign-in for the salon, capped at 3 devices. Owner only. */
export async function TeamLoginTab() {
  const session = await requireOwner();
  const supabase = await createClient();

  const { data: loginRow, error: loginError } = await supabase
    .from("team_logins")
    .select("*")
    .maybeSingle();

  // The table comes from migration 20261014000041. Without it nothing here can work.
  if (loginError) {
    return (
      <Flash tone="warning">
        Team login is not available yet: its database migration (20261014000041_team_login) has not
        been applied.
      </Flash>
    );
  }

  const login = loginRow as TeamLoginRow | null;

  if (!login) {
    const [{ data: roleRows }, { data: grantRows }] = await Promise.all([
      supabase.from("roles").select("*").eq("is_owner", false).order("name"),
      supabase.from("role_modules").select("role_id, module").eq("module", "team"),
    ]);
    const managesTeam = new Set((grantRows ?? []).map((g) => g.role_id));
    const roles = ((roleRows ?? []) as RoleRow[]).filter((r) => !managesTeam.has(r.id));

    return (
      <div className="max-w-3xl space-y-4">
        <Card>
          <CardTitle>Set up a team login</CardTitle>
          <p className="-mt-2 mb-4 text-small text-muted">
            One shared sign-in for the front desk or a shared tablet. Anyone with the team password
            signs in as it and can do whatever its role allows, so give it a role with only what the
            desk needs. It can be signed in on at most {3} devices at once.
          </p>
          <Flash tone="info" className="mb-4">
            Everyone on a shared login looks the same in the audit log: entries say &ldquo;Team
            login&rdquo;, not who. For work that must be attributed to a person, such as commission,
            use their own login.
          </Flash>
          {roles.length === 0 ? (
            <EmptyState>
              No role is suitable yet. Create one without the Team module under Roles &amp;
              permissions.
            </EmptyState>
          ) : (
            <CreateTeamLoginForm roles={roles} />
          )}
        </Card>
      </div>
    );
  }

  const [{ data: profileRow }, { data: sessionRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", login.profile_id).maybeSingle(),
    supabase
      .from("team_login_sessions")
      .select("*")
      .eq("profile_id", login.profile_id)
      .order("last_seen_at", { ascending: false })
      .limit(50),
  ]);
  const profile = profileRow as ProfileRow | null;
  const roleName = profile?.role_id
    ? (
        (await supabase.from("roles").select("name").eq("id", profile.role_id).maybeSingle()).data as {
          name: string;
        } | null
      )?.name
    : undefined;

  const sessions = (sessionRows ?? []) as TeamLoginSessionRow[];
  const timeZone = session.salon.timezone;
  const now = currentTimeMs();
  const idleMs = login.idle_minutes * 60_000;
  const isLive = (s: TeamLoginSessionRow) =>
    !s.revoked_at && now - new Date(s.last_seen_at).getTime() < idleMs;
  const live = sessions.filter(isLive);

  return (
    <div className="space-y-4">
      {profile && !profile.is_active ? (
        <Flash tone="warning">
          The team login is switched off. Reactivate it under Linked accounts to let people use it.
        </Flash>
      ) : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <StatTile
          label="Devices signed in"
          value={`${live.length} of ${login.max_sessions}`}
          tone={live.length >= login.max_sessions ? "critical" : "default"}
          hint={
            live.length >= login.max_sessions
              ? "Full: the next device is refused"
              : `A device frees its place after ${login.idle_minutes} minutes idle`
          }
        />
        <StatTile label="Team login" value={profile?.email ?? "—"} />
        <StatTile label="Role" value={roleName ?? "—"} />
      </div>

      <Card padding="none">
        <CardHeader
          title="Devices"
          description="Each device signed in with the team password. Sign one out to free its place at once."
          action={
            live.length > 0 ? (
              <form action={revokeTeamSessionAction}>
                <SubmitButton variant="danger" size="sm" pendingLabel="Signing out...">
                  Sign every device out
                </SubmitButton>
              </form>
            ) : null
          }
        />
        {sessions.length === 0 ? (
          <div className="p-5">
            <EmptyState>Nobody has signed in with the team login yet.</EmptyState>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <Table label="Team login devices" className="min-w-[620px]">
              <TableHead>
                <TableRow>
                  <TableHeader>Device</TableHeader>
                  <TableHeader>Signed in</TableHeader>
                  <TableHeader>Last active</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="right">
                    <span className="sr-only">Sign out</span>
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s) => {
                  const active = isLive(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-semibold">{describeDevice(s.user_agent)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted">
                        {formatInstantInSalon(s.created_at, timeZone)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted">
                        {formatInstantInSalon(s.last_seen_at, timeZone)}
                      </TableCell>
                      <TableCell>
                        <Pill tone={s.revoked_at ? "critical" : active ? "good" : "neutral"}>
                          {s.revoked_at ? "Signed out" : active ? "Active" : "Idle"}
                        </Pill>
                      </TableCell>
                      <TableCell align="right">
                        {active ? (
                          <form action={revokeTeamSessionAction}>
                            <input type="hidden" name="sessionId" value={s.id} />
                            <SubmitButton
                              variant="ghost"
                              size="sm"
                              pendingLabel="Signing out..."
                              aria-label={`Sign out ${describeDevice(s.user_agent)}`}
                            >
                              Sign out
                            </SubmitButton>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="max-w-3xl">
        <CardTitle>Team password</CardTitle>
        <ChangeTeamPasswordForm />
      </Card>
    </div>
  );
}
