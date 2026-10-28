import { BranchSwitcher } from "@/components/branch-switcher";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatDayLabel, instantToSalonDate, instantToSalonTime } from "@/lib/time";
import type { AppModule, BranchRow } from "@/lib/types/database";

/** The salon's own date and clock time right now, via the shared helpers. */
function nowInSalon(timeZone: string): string {
  const now = new Date();
  return `${formatDayLabel(instantToSalonDate(now, timeZone))} · ${instantToSalonTime(now, timeZone)}`;
}

/**
 * Thin bar above the page: where and when, plus shortcuts to the two things
 * done all day. The shortcuts only link to pages that guard themselves; they
 * are shown to whoever holds the module, as the sidebar is.
 */
export function Topbar({
  timeZone,
  currency,
  modules,
  branches = [],
  assignedBranch = null,
  activeBranchId = null,
  isOwner = false,
}: {
  timeZone: string;
  currency: string;
  modules: AppModule[];
  /** Every branch the viewer can see. */
  branches?: BranchRow[];
  /** The branch a non-owner login belongs to. */
  assignedBranch?: BranchRow | null;
  /** The branch an owner has chosen, or null for all of them. */
  activeBranchId?: string | null;
  isOwner?: boolean;
}) {
  const held = new Set(modules);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3.5 sm:px-8 print:hidden">
      <p className="text-small text-muted">
        {nowInSalon(timeZone)} · {timeZone} · {currency}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/*
          An owner with more than one branch chooses which to look at. Everyone
          else works in one branch, so they are told which rather than asked.
        */}
        {isOwner && branches.filter((b) => b.is_active).length > 1 ? (
          <BranchSwitcher
            branches={branches.filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name }))}
            activeId={activeBranchId}
          />
        ) : null}
        {!isOwner && assignedBranch ? <Pill tone="accent">{assignedBranch.name}</Pill> : null}
        {held.has("pos") ? (
          <ButtonLink href="/dashboard/pos" variant="ghost" size="sm">
            Open till
          </ButtonLink>
        ) : null}
        {held.has("calendar") ? (
          <ButtonLink href="/dashboard/calendar" size="sm">
            New booking
          </ButtonLink>
        ) : null}
      </div>
    </header>
  );
}
