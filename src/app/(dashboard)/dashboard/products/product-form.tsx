"use client";

import { useActionState } from "react";

import { saveProductAction, type ProductFormState } from "./actions";
import { CategoryField } from "../services/category-field";
import { EditDisclosure } from "@/components/edit-disclosure";
import { Field, Input } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ProductRow } from "@/lib/types/database";

/** Add a product, or (with `product`) edit one. */
export function ProductForm({
  currency,
  categories,
  product,
}: {
  currency: string;
  categories: string[];
  product?: ProductRow;
}) {
  const [state, formAction] = useActionState<ProductFormState, FormData>(saveProductAction, {});
  const isEdit = Boolean(product);
  const id = product?.id ?? "new";

  const body = (
    <form action={formAction} className="space-y-4">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" htmlFor={`product-name-${id}`} error={state.errors?.name}>
          <Input
            id={`product-name-${id}`}
            name="name"
            defaultValue={product?.name}
            required
            placeholder="Argan oil 100ml"
          />
        </Field>

        <Field
          label="SKU"
          htmlFor={`product-sku-${id}`}
          error={state.errors?.sku}
          hint="Optional. Your own code or the barcode; unique if given."
        >
          <Input
            id={`product-sku-${id}`}
            name="sku"
            defaultValue={product?.sku}
            placeholder="ARG-100"
            autoComplete="off"
          />
        </Field>

        <CategoryField
          id={`product-category-${id}`}
          categories={categories}
          defaultValue={product?.category ?? ""}
          error={state.errors?.category}
        />

        <Field
          label={`Price (${currency})`}
          htmlFor={`product-price-${id}`}
          error={state.errors?.price}
        >
          <Input
            id={`product-price-${id}`}
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.price}
            required
          />
        </Field>

        <Field
          label="Stock on hand"
          htmlFor={`product-stock-${id}`}
          error={state.errors?.stockQuantity}
          hint={isEdit ? "Sales take stock off by themselves; set it here after a stock-take." : undefined}
        >
          <Input
            id={`product-stock-${id}`}
            name="stockQuantity"
            type="number"
            step="1"
            min="0"
            defaultValue={product?.stock_quantity ?? 0}
            required
          />
        </Field>

        <Field
          label="Low-stock threshold"
          htmlFor={`product-low-${id}`}
          error={state.errors?.lowStockThreshold}
          hint="Flagged as low when stock is at or below this."
        >
          <Input
            id={`product-low-${id}`}
            name="lowStockThreshold"
            type="number"
            step="1"
            min="0"
            defaultValue={product?.low_stock_threshold ?? 5}
            required
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving...">{isEdit ? "Save changes" : "Add product"}</SubmitButton>
    </form>
  );

  if (!isEdit) return body;
  return <EditDisclosure label="Edit">{body}</EditDisclosure>;
}
