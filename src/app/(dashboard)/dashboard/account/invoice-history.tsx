"use client";

import { useState } from "react";

import { payInvoiceAction } from "./billing-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type InvoiceFilter = "paid" | "open" | "failed";

/** An invoice as the table shows it. Built on the server, so no formatting happens here. */
export interface InvoiceView {
  id: string;
  stripeId: string;
  date: string;
  description: string;
  method: string;
  amount: string;
  discount: string;
  /** Which filter it falls under, or null for draft / void. */
  group: InvoiceFilter | null;
  statusLabel: string;
  tone: PillTone;
  canPay: boolean;
  pdf: string | null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "open", label: "Open" },
  { value: "failed", label: "Failed" },
] as const;

/** Billing history: newest first, filtered in the browser (there are at most a couple of dozen). */
export function InvoiceHistory({ rows }: { rows: InvoiceView[] }) {
  const [filter, setFilter] = useState<"all" | InvoiceFilter>("all");
  const shown = rows.filter((r) => filter === "all" || r.group === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Invoice status"
          options={FILTERS}
          value={filter}
          onValueChange={setFilter}
        />
        <span className="text-small text-muted">
          {shown.length} of {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No invoices yet.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>No invoices match this filter.</EmptyState>
      ) : (
        <Table label="Billing history" className="min-w-[860px]">
          <TableHead>
            <TableRow>
              <TableHeader>Date</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Method</TableHeader>
              <TableHeader align="right">Amount</TableHeader>
              <TableHeader align="right">Discount</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader align="right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((invoice) => (
              <TableRow key={invoice.id} className={invoice.canPay ? "bg-warning-bg/40" : undefined}>
                <TableCell>{invoice.date}</TableCell>
                <TableCell>{invoice.description}</TableCell>
                <TableCell className="text-muted">{invoice.method}</TableCell>
                <TableCell align="right" className="font-semibold">
                  {invoice.amount}
                </TableCell>
                <TableCell align="right" className="text-muted">
                  {invoice.discount}
                </TableCell>
                <TableCell>
                  <Pill tone={invoice.tone}>{invoice.statusLabel}</Pill>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {invoice.canPay ? (
                      <form action={payInvoiceAction}>
                        <input type="hidden" name="invoiceId" value={invoice.stripeId} />
                        <SubmitButton size="sm" variant="success" pendingLabel="Paying...">
                          Pay now
                        </SubmitButton>
                      </form>
                    ) : null}
                    {invoice.pdf ? (
                      <a
                        href={invoice.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download invoice for ${invoice.date}`}
                        className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-small font-semibold text-accent no-underline hover:bg-soft"
                      >
                        Invoice
                      </a>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
