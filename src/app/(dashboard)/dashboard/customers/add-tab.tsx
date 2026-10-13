import { CustomerForm } from "./customer-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";

/** Customers › Add customer. */
export async function AddTab() {
  await requireModule("customers");

  return (
    <Card className="max-w-3xl">
      <CardTitle>New customer</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        The phone number identifies them, and must be unique within this salon.
      </p>
      <CustomerForm />
    </Card>
  );
}
