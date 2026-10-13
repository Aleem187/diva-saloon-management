import { VoidReceiptForm } from "./void-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";

/** Receipt › Void. The owner's, and only for an issued receipt (the page decides that). */
export async function VoidTab({ receiptId }: { receiptId: string }) {
  const session = await requireModule("pos");
  // Defence in depth: the voidReceiptAction and void_receipt() refuse anyone
  // else regardless.
  if (session.profile.role !== "owner") return null;

  return (
    <Card className="max-w-xl">
      <CardTitle>Void this receipt</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        The receipt stays on the record marked voided, and the loyalty it moved is reversed. This
        cannot be undone.
      </p>
      <VoidReceiptForm receiptId={receiptId} />
    </Card>
  );
}
