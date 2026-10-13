import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/auth/session";

const PHASES = [
  { n: 1, label: "Auth + multi-tenant scaffolding", done: true },
  { n: 2, label: "Services, settings, customers, consent forms", done: true },
  { n: 3, label: "Appointment / booking calendar", done: true },
  { n: 4, label: "POS receipts + loyalty earn/redeem", done: true },
  { n: 5, label: "Payroll", done: true },
  { n: 6, label: "Reporting & analytics", done: true },
  { n: 7, label: "Audit logging (threaded through each phase)", done: true },
  { n: 8, label: "Stripe subscription billing + access gating", done: true },
  { n: 9, label: "Appearance: colour schemes, fonts and text size", done: true },
  { n: 10, label: "Billings: invoices, cards and discount codes", done: true },
  { n: 11, label: "Redesign: shell, sign-in, Overview, Calendar, Customers, POS, Services, Team, Settings, Account", done: true },
  { n: 12, label: "Redesign: Payroll, My earnings, Reports and Audit log", done: false },
];

/** Overview › Build status. Owner only: it is the product's own checklist. */
export async function BuildTab() {
  await requireOwner();

  return (
    <Table label="Build phases">
      <TableHead>
        <TableRow>
          <TableHeader>Phase</TableHeader>
          <TableHeader>Status</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {PHASES.map((phase) => (
          <TableRow key={phase.n}>
            <TableCell>
              <span className="mr-2 text-fine text-muted">{phase.n}</span>
              <span className="font-semibold">{phase.label}</span>
            </TableCell>
            <TableCell>
              <Pill tone={phase.done ? "good" : "neutral"}>{phase.done ? "Done" : "Planned"}</Pill>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
