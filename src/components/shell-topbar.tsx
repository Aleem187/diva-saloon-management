import { ButtonLink } from "@/components/ui/button";
import { formatDayLabel, instantToSalonDate, instantToSalonTime } from "@/lib/time";
import type { AppModule } from "@/lib/types/database";

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
}: {
  timeZone: string;
  currency: string;
  modules: AppModule[];
}) {
  const held = new Set(modules);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3.5 sm:px-8 print:hidden">
      <p className="text-small text-muted">
        {nowInSalon(timeZone)} · {timeZone} · {currency}
      </p>
      <div className="flex flex-wrap items-center gap-3">
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
