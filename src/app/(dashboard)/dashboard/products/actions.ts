"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { assertModule, requireSession } from "@/lib/auth/session";
import { canonicalCategory, distinctCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, productSchema } from "@/lib/validation";

export interface ProductFormState {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
}

/**
 * Add or edit a retail product. The catalogue is the Services module's, so the
 * same permission governs it (RLS says so too). Stock edited here is a count the
 * owner sets -- sales and voids move it themselves, inside the database.
 */
export async function saveProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const session = await requireSession();
  try {
    assertModule(session, "services");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") ?? "",
    category: formData.get("category") || "General",
    price: formData.get("price"),
    stockQuantity: formData.get("stockQuantity"),
    lowStockThreshold: formData.get("lowStockThreshold") || 0,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const rawId = String(formData.get("productId") ?? "").trim();
  const productId = rawId === "" ? null : rawId;
  const supabase = await createClient();

  // A category matching an existing one ignoring case and spacing is saved under
  // the existing spelling, so "hair care" cannot become a second "Hair care".
  const { data: categoryRows } = await supabase.from("products").select("category");
  const category = canonicalCategory(
    input.category,
    distinctCategories(((categoryRows ?? []) as { category: string }[]).map((r) => r.category)),
  );

  const before = productId
    ? (
        await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", productId)
          .maybeSingle()
      ).data
    : null;

  // Every column written explicitly (CLAUDE.md rule 5).
  const row = {
    salon_id: session.profile.salon_id,
    name: input.name,
    sku: input.sku,
    category,
    price: input.price,
    stock_quantity: input.stockQuantity,
    low_stock_threshold: input.lowStockThreshold,
  };

  const { data: saved, error } = productId
    ? await supabase.from("products").update(row).eq("id", productId).select("id").maybeSingle()
    : await supabase.from("products").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") {
      return error.message.includes("sku")
        ? { errors: { sku: "Another product already uses that SKU." } }
        : { errors: { name: "Another live product already uses that name." } };
    }
    return { message: error.message };
  }
  if (!saved) return { message: "That product no longer exists." };

  await logAudit(session, {
    action: productId ? AUDIT_ACTIONS.PRODUCT_UPDATED : AUDIT_ACTIONS.PRODUCT_CREATED,
    entityType: "product",
    entityId: saved.id,
    metadata: {
      name: input.name,
      sku: input.sku,
      price: input.price,
      stock_quantity: input.stockQuantity,
      ...(before && before.stock_quantity !== input.stockQuantity
        ? { stock_was: before.stock_quantity }
        : {}),
    },
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
  return { success: productId ? "Product updated." : `${input.name} added.` };
}

/** Archive keeps a product off the till without touching past sales. */
export async function setProductActiveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertModule(session, "services");

  const productId = String(formData.get("productId") ?? "");
  const isActive = formData.get("isActive") === "true";
  if (!productId) return;

  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .select("name")
    .maybeSingle();

  // A zero-row update is not an error (rule 7), so say nothing happened if so.
  if (updated) {
    await logAudit(session, {
      action: isActive ? AUDIT_ACTIONS.PRODUCT_RESTORED : AUDIT_ACTIONS.PRODUCT_ARCHIVED,
      entityType: "product",
      entityId: productId,
      metadata: { name: updated.name },
    });
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/pos");
}
