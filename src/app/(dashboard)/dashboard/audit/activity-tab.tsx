import { AuditFeed } from "./audit-feed";
import { AUDIT_WINDOW_DAYS, auditHref, loadEntries, PAGE_SIZE, type Actor, type AuditFilters } from "./query";
import { ButtonLink } from "@/components/ui/button";
import { requireModule } from "@/lib/auth/session";
import { AUDIT_CATEGORIES } from "@/lib/audit-categories";

/** Audit log › All activity: the newest entries that match, grouped by day. */
export async function ActivityTab({
  filters,
  entryId,
  actors,
}: {
  filters: AuditFilters;
  entryId: string;
  actors: Actor[];
}) {
  const session = await requireModule("audit");
  const rows = await loadEntries(filters, session.salon.timezone);

  return (
    <div className="space-y-4">
      <nav aria-label="Areas" className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={auditHref(filters, { tab: "activity", category: "" })}
          variant={filters.category ? "ghost" : "primary"}
          size="sm"
          scroll={false}
          aria-current={filters.category ? undefined : "true"}
        >
          All areas
        </ButtonLink>
        {AUDIT_CATEGORIES.map((category) => (
          <ButtonLink
            key={category.id}
            href={auditHref(filters, { tab: "activity", category: category.id })}
            variant={filters.category === category.id ? "primary" : "ghost"}
            size="sm"
            scroll={false}
            aria-current={filters.category === category.id ? "true" : undefined}
          >
            {category.label}
          </ButtonLink>
        ))}
      </nav>

      <AuditFeed
        rows={rows}
        timeZone={session.salon.timezone}
        modules={session.modules}
        filters={filters}
        tab="activity"
        entryId={entryId}
        actors={actors}
        intro={`The newest ${PAGE_SIZE} matching entries from the last ${AUDIT_WINDOW_DAYS} days (${rows.length} shown). Choose one to see what was recorded.`}
        emptyText={`No audit entries in the last ${AUDIT_WINDOW_DAYS} days match those filters.`}
      />
    </div>
  );
}
