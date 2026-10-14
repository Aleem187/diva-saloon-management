import Link from "next/link";

import { AUDIT_WINDOW_DAYS, auditHref, loadEntries, PAGE_SIZE, type Actor, type AuditFilters } from "./query";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireModule } from "@/lib/auth/session";
import { actionLabel, isSensitive } from "@/lib/audit-categories";
import { formatInstantInSalon } from "@/lib/time";
import type { AuditLogRow } from "@/lib/types/database";

/**
 * Audit log › By person: who did what among the entries on show.
 *
 * The totals are over the entries loaded (the newest 50 that match), never the
 * whole log, and the page says so: a count over a window must not read as a
 * count over everything (G-AUD-4).
 */
export async function PeopleTab({
  filters,
  actors,
}: {
  filters: AuditFilters;
  actors: Actor[];
}) {
  const session = await requireModule("audit");
  const rows = await loadEntries(filters, session.salon.timezone);

  if (rows.length === 0) return <EmptyState>No audit entries in the last {AUDIT_WINDOW_DAYS} days match those filters.</EmptyState>;

  const nameOf = new Map(actors.map((a) => [a.id, a.full_name || a.email]));

  // Entries are newest first, so the first one seen for a person is their latest.
  const people = new Map<
    string,
    { key: string; actorId: string | null; name: string; role: string | null; entries: AuditLogRow[] }
  >();
  for (const row of rows) {
    const key = row.actor_id ?? row.actor_email ?? "system";
    const person = people.get(key) ?? {
      key,
      actorId: row.actor_id,
      name: (row.actor_id && nameOf.get(row.actor_id)) || row.actor_email || "System",
      role: row.actor_role,
      entries: [],
    };
    person.entries.push(row);
    people.set(key, person);
  }
  const list = [...people.values()].sort((a, b) => b.entries.length - a.entries.length);

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">
        Counted over the newest {PAGE_SIZE} matching entries from the last {AUDIT_WINDOW_DAYS} days ({rows.length} shown), not the whole log.
      </p>

      <Table label="Activity by person" className="min-w-[640px]">
        <TableHead>
          <TableRow>
            <TableHeader>Person</TableHeader>
            <TableHeader align="right">Entries shown</TableHeader>
            <TableHeader align="right">Sensitive</TableHeader>
            <TableHeader>Latest action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map((person) => {
            const latest = person.entries[0];
            const sensitive = person.entries.filter((e) => isSensitive(e.action)).length;
            return (
              <TableRow key={person.key}>
                <TableCell>
                  {person.actorId ? (
                    <Link
                      href={auditHref(
                        { ...filters, actor: person.actorId },
                        { tab: "activity" },
                      )}
                      className="font-semibold text-accent hover:underline"
                    >
                      {person.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{person.name}</span>
                  )}
                  {person.role ? <span className="text-muted"> ({person.role})</span> : null}
                </TableCell>
                <TableCell align="right" className="tabular-nums">
                  {person.entries.length}
                </TableCell>
                <TableCell align="right">
                  {sensitive > 0 ? (
                    <Pill tone="warning">{sensitive}</Pill>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="block">{actionLabel(latest.action)}</span>
                  <span className="block text-fine text-muted">
                    {formatInstantInSalon(latest.created_at, session.salon.timezone)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
