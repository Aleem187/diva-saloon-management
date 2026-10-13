import Link from "next/link";
import type { ReactNode } from "react";

import { auditHref, type Actor, type AuditFilters } from "./query";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionLabel, categoryLabel, categoryOf, isSensitive } from "@/lib/audit-categories";
import { formatInstantInSalon } from "@/lib/time";
import type { AppModule, AuditLogRow, Json } from "@/lib/types/database";

/** Where a record an entry points at can be opened, and which module opens it. */
const RECORD_LINKS: Record<string, { module: AppModule; href: (id: string) => string; noun: string }> = {
  receipt: { module: "pos", href: (id) => `/dashboard/pos/${id}`, noun: "receipt" },
  appointment: { module: "calendar", href: (id) => `/dashboard/calendar/${id}`, noun: "appointment" },
  customer: { module: "customers", href: (id) => `/dashboard/customers/${id}`, noun: "customer" },
};

export function recordLink(
  entry: AuditLogRow,
  modules: Set<AppModule>,
): { href: string; label: string } | null {
  const target = entry.entity_type ? RECORD_LINKS[entry.entity_type] : undefined;
  if (!target || !entry.entity_id || !modules.has(target.module)) return null;
  return { href: target.href(entry.entity_id), label: `Open ${target.noun}` };
}

/**
 * What the Details column says: the kind of record and a short form of its id,
 * both as stored. There is no written summary to show -- nothing records one.
 */
function detailsOf(entry: AuditLogRow): ReactNode {
  if (!entry.entity_type) return <span aria-label="No record">—</span>;
  return (
    <>
      <span className="capitalize">{entry.entity_type.replace(/_/g, " ")}</span>
      {entry.entity_id ? (
        <span className="ml-1.5 font-mono text-fine" title={entry.entity_id}>
          {entry.entity_id.slice(0, 8)}
        </span>
      ) : null}
    </>
  );
}

interface FeedProps {
  rows: AuditLogRow[];
  timeZone: string;
  modules: Set<AppModule>;
  filters: AuditFilters;
  tab: string;
  entryId: string;
  actors: Actor[];
  /** Said above the list: how many are shown, and what they are. */
  intro: ReactNode;
  emptyText: string;
}

/**
 * A table of entries (When, Who, Action, Details) beside the detail of the one chosen.
 *
 * Choosing an entry is a link (`?entry=`), so a particular entry can be shared
 * and the page stays a server component. Each entry renders exactly one <time>
 * and the panel renders none, which is what `test-audit` counts.
 */
export function AuditFeed({
  rows,
  timeZone,
  modules,
  filters,
  tab,
  entryId,
  actors,
  intro,
  emptyText,
}: FeedProps) {
  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  const selected = rows.find((row) => String(row.id) === entryId) ?? null;
  const actorName = new Map(actors.map((a) => [a.id, a.full_name || a.email]));

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">{intro}</p>

      <Split>
        <SplitMain>
          <Table label="Audit entries" className="min-w-[620px]">
            <TableHead>
              <TableRow>
                <TableHeader>When</TableHeader>
                <TableHeader>Who</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Details</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((entry) => {
                const chosen = selected?.id === entry.id;
                return (
                  <TableRow key={entry.id} selected={chosen}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={auditHref(filters, { tab, entry: entry.id })}
                        scroll={false}
                        aria-current={chosen ? "true" : undefined}
                        aria-label={`Open details: ${actionLabel(entry.action)}`}
                        className="font-semibold text-accent tabular-nums hover:underline"
                      >
                        <time dateTime={entry.created_at}>
                          {formatInstantInSalon(entry.created_at, timeZone)}
                        </time>
                      </Link>
                    </TableCell>
                    <TableCell className="break-words">
                      {(entry.actor_id && actorName.get(entry.actor_id)) ||
                        entry.actor_email ||
                        "system"}
                      {entry.actor_role ? (
                        <span className="block text-fine text-muted">{entry.actor_role}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone="accent">{actionLabel(entry.action)}</Pill>
                        {isSensitive(entry.action) ? <Pill tone="warning">Sensitive</Pill> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-small text-muted">{detailsOf(entry)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SplitMain>

        {selected ? (
          <EntryPanel
            entry={selected}
            timeZone={timeZone}
            modules={modules}
            closeHref={auditHref(filters, { tab })}
          />
        ) : null}
      </Split>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

function EntryPanel({
  entry,
  timeZone,
  modules,
  closeHref,
}: {
  entry: AuditLogRow;
  timeZone: string;
  modules: Set<AppModule>;
  closeHref: string;
}) {
  const category = categoryOf(entry.action);
  const link = recordLink(entry, modules);
  const metadata =
    entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
      ? Object.entries(entry.metadata as Record<string, Json>)
      : [];

  return (
    <SidePanel
      title={actionLabel(entry.action)}
      actions={
        <Link
          href={closeHref}
          scroll={false}
          className="text-small font-semibold text-accent underline underline-offset-[3px]"
        >
          Close
        </Link>
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
        <Row term="When">{formatInstantInSalon(entry.created_at, timeZone)}</Row>
        <Row term="Who">
          {entry.actor_email ?? "system"}
          {entry.actor_role ? <span className="text-muted"> ({entry.actor_role})</span> : null}
        </Row>
        {category ? <Row term="Area">{categoryLabel(category)}</Row> : null}
        <Row term="Action code">
          <span className="font-mono text-fine">{entry.action}</span>
        </Row>
        {entry.entity_type ? (
          <Row term="Record">
            {entry.entity_type.replace(/_/g, " ")}
            {entry.entity_id ? (
              <span className="block break-all font-mono text-fine text-muted">
                {entry.entity_id}
              </span>
            ) : null}
          </Row>
        ) : null}
      </dl>

      {link ? (
        <Link href={link.href} className="text-small font-semibold text-accent underline underline-offset-[3px]">
          {link.label}
        </Link>
      ) : null}

      <div>
        <h3 className="mb-2 font-heading text-small font-semibold text-ink">Details</h3>
        {metadata.length === 0 ? (
          <p className="text-small text-muted">Nothing more was recorded for this entry.</p>
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
            {metadata.map(([key, value]) => (
              <Row key={key} term={humanise(key)}>
                <MetadataValue value={value} />
              </Row>
            ))}
          </dl>
        )}
      </div>

      <p className="text-fine text-muted">The audit log is append-only: entries cannot be edited or deleted.</p>
    </SidePanel>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

/** "total_commission" to "Total commission". The stored key is not changed. */
function humanise(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The value exactly as recorded; nested values are shown as JSON. */
function MetadataValue({ value }: { value: Json }) {
  if (value === null) return <span className="text-muted">None</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "string" || typeof value === "number") return <>{String(value)}</>;
  return (
    <pre className="overflow-x-auto rounded-lg bg-track px-2.5 py-2 font-mono text-fine whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
