import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { StatTile } from "@/components/ui/stat-tile";
import { requireSession } from "@/lib/auth/session";
import { trialDaysRemaining } from "@/components/shell-sidebar-parts";
import { createClient } from "@/lib/supabase/server";

/** Overview › Today: a glance at the salon, and where the owner starts. */
export async function TodayTab() {
  const session = await requireSession();
  const { salon } = session;

  const supabase = await createClient();

  // RLS scopes this count to the caller's salon; no salon_id filter is needed
  // for correctness, but it is left in as a readable second line of defence.
  const { count: teamCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salon.id)
    .eq("is_active", true);

  const daysLeft = trialDaysRemaining(salon.trial_ends_at);

  return (
    <div className="space-y-4">
      {/* The owner gets the full picture on the Trial & plan tab. */}
      {salon.subscription_status === "trialing" && !session.isOwner ? (
        <Flash tone="info">
          Your salon&rsquo;s free trial has{" "}
          <strong>
            {daysLeft} {daysLeft === 1 ? "day" : "days"}
          </strong>{" "}
          left.
        </Flash>
      ) : null}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label="Active team members" value={teamCount ?? 0} />
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <Card>
          <CardTitle>Your salon</CardTitle>
          <dl className="text-small">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3 first:pt-0">
              <dt className="text-muted">Timezone</dt>
              <dd>{salon.timezone}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3">
              <dt className="text-muted">Currency</dt>
              <dd>{salon.currency}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
              <dt className="text-muted">Signed in as</dt>
              <dd>{session.role?.name ?? "No role"}</dd>
            </div>
          </dl>
        </Card>

        {session.isOwner ? (
          <Card>
            <CardTitle>Get started</CardTitle>
            <p className="mb-4 text-small text-muted">
              Everything you see is scoped to <strong>{salon.name}</strong>. That scoping is
              enforced by Postgres Row Level Security, not by the interface &mdash; another
              salon&rsquo;s data is unreachable even through a crafted request.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/dashboard/team" size="sm">
                Invite your team
              </ButtonLink>
              <ButtonLink href="/dashboard/settings" variant="ghost" size="sm">
                Review salon settings
              </ButtonLink>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
