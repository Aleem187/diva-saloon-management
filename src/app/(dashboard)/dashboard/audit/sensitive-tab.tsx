import { AuditFeed } from "./audit-feed";
import { AUDIT_WINDOW_DAYS, loadEntries, PAGE_SIZE, type Actor, type AuditFilters } from "./query";
import { requireModule } from "@/lib/auth/session";

/**
 * Audit log › Sensitive actions: only the entries that move money, change who
 * can do what, change pay, open protected records or alter the rules the money
 * runs on. The list lives in @/lib/audit-categories.
 */
export async function SensitiveTab({
  filters,
  entryId,
  actors,
}: {
  filters: AuditFilters;
  entryId: string;
  actors: Actor[];
}) {
  const session = await requireModule("audit");
  const rows = await loadEntries(filters, session.salon.timezone, { sensitiveOnly: true });

  return (
    <AuditFeed
      rows={rows}
      timeZone={session.salon.timezone}
      modules={session.modules}
      filters={filters}
      tab="sensitive"
      entryId={entryId}
      actors={actors}
      intro={`Voids, refunds, payroll and pay changes, roles and access, views of protected records, settings and billing changes. The newest ${PAGE_SIZE} matching from the last ${AUDIT_WINDOW_DAYS} days (${rows.length} shown).`}
      emptyText={`No sensitive actions in the last ${AUDIT_WINDOW_DAYS} days match those filters.`}
    />
  );
}
