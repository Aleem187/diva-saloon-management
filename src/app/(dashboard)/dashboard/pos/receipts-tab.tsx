import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireModule } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  daysInRange,
  endOfMonth,
  formatInstantInSalon,
  salonTimeToInstant,
  salonToday,
  startOfMonth,
  startOfWeek,
} from "@/lib/time";
import type { ReceiptRow } from "@/lib/types/database";

/** The columns the Receipts list reads. */
type ListedReceipt = Pick<
  ReceiptRow,
  "id" | "receipt_number" | "customer_id" | "created_at" | "payment_method" | "status" | "total"
>;

type Params = Record<string, string | string[] | undefined>;

/** Same reasoning as the calendar's agenda: a longer span is a mistyped year. */
const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: unknown, fallback: string): string {
  return typeof value === "string" && ISO_DATE.test(value) ? value : fallback;
}

const METHOD_LABEL = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  split: "Split",
} as const;

function posHref(from: string, to: string, status: string): string {
  return `/dashboard/pos?tab=receipts&from=${from}&to=${to}&status=${status}`;
}

/** POS › Receipts: what was taken in a range, and a way into each receipt. */
export async function ReceiptsTab({ params }: { params: Params }) {
  const session = await requireModule("pos");
  const supabase = await createClient();
  const currency = session.salon.currency;
  const timeZone = session.salon.timezone;
  const today = salonToday(timeZone);

  // The till defaults to what it is for -- today's takings. Everything else is
  // a deliberate look back.
  let from = asDate(params.from, today);
  let to = asDate(params.to, today);
  if (to < from) [from, to] = [to, from];
  let rangeTooLong = false;
  if (daysInRange(from, to) > MAX_RANGE_DAYS) {
    to = addDays(from, MAX_RANGE_DAYS - 1);
    rangeTooLong = true;
  }

  const status = params.status === "issued" || params.status === "voided" ? params.status : "all";

  /*
   * The range is a pair of salon-local calendar days, so it is converted to
   * instants here rather than compared as dates. A sale at 11pm on the 30th
   * belongs to the day the salon was working, not to whatever UTC says --
   * the same rule the Phase 6 reports and payroll use.
   */
  const rangeStartsAt = salonTimeToInstant(from, "00:00", timeZone).toISOString();
  const rangeEndsAt = salonTimeToInstant(addDays(to, 1), "00:00", timeZone).toISOString();

  // Only what the list shows, not every column of up to 500 receipts.
  let receiptQuery = supabase
    .from("receipts")
    .select("id, receipt_number, customer_id, created_at, payment_method, status, total")
    .gte("created_at", rangeStartsAt)
    .lt("created_at", rangeEndsAt)
    .order("created_at", { ascending: false })
    .limit(500);

  if (status !== "all") receiptQuery = receiptQuery.eq("status", status);

  const { data: receipts } = await receiptQuery;
  const rows = (receipts ?? []) as ListedReceipt[];

  /*
   * The names of the customers on THESE receipts, and only those. This used to
   * read the first 500 customers by name, which both loaded far more than the
   * page shows and left a receipt without a name whenever its customer fell
   * outside the first 500. Asked for in small groups: 500 ids in one request
   * would overrun the URL.
   */
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const nameChunks = await Promise.all(
    Array.from({ length: Math.ceil(customerIds.length / 80) }, (_, i) =>
      supabase
        .from("customers")
        .select("id, full_name")
        .in("id", customerIds.slice(i * 80, i * 80 + 80)),
    ),
  );
  const customerName = new Map<string, string>();
  for (const { data } of nameChunks) {
    for (const c of (data ?? []) as { id: string; full_name: string }[]) {
      customerName.set(c.id, c.full_name);
    }
  }
  const issued = rows.filter((r) => r.status === "issued");
  const voided = rows.filter((r) => r.status === "voided");
  // Voided money was given back, so it is not takings. Counted separately so
  // the owner can see how much was reversed.
  const takings = issued.reduce((sum, r) => sum + Number(r.total), 0);
  const reversed = voided.reduce((sum, r) => sum + Number(r.total), 0);

  const rangeLabel = from === to ? (from === today ? "today" : from) : `${from} to ${to}`;

  return (
    <div className="space-y-4">
      <Card>
        {/*
          A plain GET form, so a particular day's takings are a linkable URL
          and survive a refresh.
        */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value="receipts" />
          <div className="w-44">
            <label htmlFor="pos-from" className="mb-1.5 block text-small font-semibold">
              From
            </label>
            <Input id="pos-from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="w-44">
            <label htmlFor="pos-to" className="mb-1.5 block text-small font-semibold">
              To
            </label>
            <Input id="pos-to" name="to" type="date" defaultValue={to} />
          </div>
          <div className="w-40">
            <label htmlFor="pos-status" className="mb-1.5 block text-small font-semibold">
              Status
            </label>
            <Select id="pos-status" name="status" defaultValue={status}>
              <option value="all">All</option>
              <option value="issued">Issued only</option>
              <option value="voided">Voided only</option>
            </Select>
          </div>
          <Button type="submit" variant="ghost">
            Show
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-small">
          <span className="text-muted">Quick:</span>
          <ButtonLink href={posHref(today, today, status)} variant="ghost" size="sm">
            Today
          </ButtonLink>
          <ButtonLink
            href={posHref(addDays(today, -1), addDays(today, -1), status)}
            variant="ghost"
            size="sm"
          >
            Yesterday
          </ButtonLink>
          <ButtonLink
            href={posHref(startOfWeek(today), addDays(startOfWeek(today), 6), status)}
            variant="ghost"
            size="sm"
          >
            This week
          </ButtonLink>
          <ButtonLink
            href={posHref(startOfMonth(today), endOfMonth(today), status)}
            variant="ghost"
            size="sm"
          >
            This month
          </ButtonLink>
          <ButtonLink href={posHref(addDays(today, -29), today, status)} variant="ghost" size="sm">
            Last 30 days
          </ButtonLink>
        </div>

        {rangeTooLong ? (
          <p className="mt-3 text-small text-warning-fg">
            That range was longer than a year, so it has been trimmed to {MAX_RANGE_DAYS} days.
          </p>
        ) : null}
      </Card>

      <p className="text-small text-muted">Showing {rangeLabel}. Open a receipt to print it.</p>

      {/* What the range came to. */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label="Receipts issued" value={String(issued.length)} />
        <StatTile label="Takings" value={formatMoney(takings, currency)} />
        <StatTile
          label="Voided"
          value={
            voided.length === 0 ? "None" : `${voided.length} · ${formatMoney(reversed, currency)}`
          }
          tone={voided.length > 0 ? "critical" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState>No receipts in this range.</EmptyState>
      ) : (
        <Table label="Receipts" className="min-w-[640px]">
          <TableHead>
            <TableRow>
              <TableHeader>Receipt</TableHeader>
              <TableHeader>Customer</TableHeader>
              <TableHeader>When</TableHeader>
              <TableHeader>Method</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader align="right">Total</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/pos/${receipt.id}`}
                    className="font-semibold text-accent tabular-nums hover:underline"
                  >
                    #{receipt.receipt_number}
                  </Link>
                </TableCell>
                <TableCell>{customerName.get(receipt.customer_id) ?? "Customer"}</TableCell>
                <TableCell className="text-muted">
                  {formatInstantInSalon(receipt.created_at, timeZone)}
                </TableCell>
                <TableCell className="text-muted">
                  {METHOD_LABEL[receipt.payment_method] ?? receipt.payment_method}
                </TableCell>
                <TableCell>
                  <Pill tone={receipt.status === "voided" ? "critical" : "good"}>
                    {receipt.status === "voided" ? "Voided" : "Issued"}
                  </Pill>
                </TableCell>
                <TableCell
                  align="right"
                  className={receipt.status === "voided" ? "text-muted line-through" : "font-semibold"}
                >
                  {formatMoney(receipt.total, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
