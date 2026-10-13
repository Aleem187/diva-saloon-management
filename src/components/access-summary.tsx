import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Pill, type PillTone } from "@/components/ui/pill";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import { ROLE_DESCRIPTIONS, requireSession } from "@/lib/auth/session";
import { MODULES } from "@/lib/modules";

type Level = "full" | "own" | "none";

const LEVEL: Record<Level, { label: string; tone: PillTone; mark: string; markClass: string }> = {
  full: { label: "Full access", tone: "good", mark: "✓", markClass: "bg-good-bg text-good-fg" },
  own: { label: "Own schedule only", tone: "warning", mark: "◐", markClass: "bg-warning-bg text-warning-fg" },
  none: { label: "No access", tone: "neutral", mark: "–", markClass: "bg-neutral-bg text-neutral" },
};

/**
 * What this login can reach, shown on Account > Access and Overview > Your
 * access. Read from the same module set the sidebar and every page guard use.
 * The owner holds everything.
 *
 * The calendar is the one module with a middle state: a login without it
 * still sees its own diary, because the appointments policy admits a
 * therapist's own rows whatever their role holds (see `@/lib/modules`).
 */
export async function AccessSummary() {
  const session = await requireSession();

  const rows = MODULES.map((m) => {
    const held = session.modules.has(m.module);
    const level: Level = held ? "full" : m.module === "calendar" ? "own" : "none";
    return { ...m, level };
  });

  const count = (level: Level) => rows.filter((r) => r.level === level).length;

  return (
    <Split>
      <SplitMain>
        <Card>
          <div className="mb-1.5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-section font-semibold">
                Your role: {session.role?.name ?? "none"}
              </h2>
              <p className="text-small text-muted">{ROLE_DESCRIPTIONS[session.profile.role]}</p>
            </div>
            <Pill tone="accent">{session.role?.name ?? "No role"}</Pill>
          </div>

          <ul>
            {rows.map((row) => {
              const level = LEVEL[row.level];
              return (
                <li
                  key={row.module}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-line-soft py-3 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className={cn("grid size-7 place-items-center rounded-lg", level.markClass)}
                  >
                    {level.mark}
                  </span>
                  <div>
                    <p className="font-semibold">{row.label}</p>
                    <p className="text-small text-muted">{row.detail}</p>
                  </div>
                  <Pill tone={level.tone}>{level.label}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      </SplitMain>

      <SidePanel title="Need more access?">
        <p className="text-small text-muted">
          Access is set by the salon owner in Team &rsaquo; Roles &amp; permissions. Ask them to
          change your role or adjust what it can do.
        </p>
        <dl className="text-small">
          <div className="flex items-center justify-between border-b border-line-soft py-3">
            <dt className="text-muted">Full access</dt>
            <dd className="font-semibold">{count("full")}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-line-soft py-3">
            <dt className="text-muted">Limited</dt>
            <dd className="font-semibold">{count("own")}</dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-muted">No access</dt>
            <dd className="font-semibold">{count("none")}</dd>
          </div>
        </dl>
        {session.isOwner ? (
          <p className="rounded-xl bg-warning-bg px-3.5 py-3 text-small text-warning-fg">
            As the owner you have full access to everything.
          </p>
        ) : null}
      </SidePanel>
    </Split>
  );
}
