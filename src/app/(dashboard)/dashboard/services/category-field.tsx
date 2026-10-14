"use client";

import { useState } from "react";

import { Field, Input } from "@/components/ui/field";
import { canonicalCategory, cleanCategory } from "@/lib/services";

/**
 * Category: type to search the salon's existing categories, or type a new one.
 *
 * A text box with a native suggestion list, rather than a locked select, so a new
 * category can still be made on the spot. What stops typos splitting the menu is
 * the matching: a name that matches an existing one ignoring case and spacing is
 * saved under the existing spelling (the server does this too), and the hint says
 * which will happen before saving.
 */
export function CategoryField({
  id,
  categories,
  defaultValue = "",
  error,
}: {
  id: string;
  categories: string[];
  defaultValue?: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const listId = `${id}-options`;

  const typed = cleanCategory(value);
  const resolved = canonicalCategory(value, categories);
  const isExisting = categories.includes(resolved);

  let hint: string;
  if (!typed) {
    hint = categories.length
      ? "Pick one of your categories, or type a new one. Left blank it is filed under General."
      : "Type a name for the first category. Left blank it is filed under General.";
  } else if (!isExisting) {
    hint = `New category: “${resolved}” will be created.`;
  } else if (resolved !== typed) {
    hint = `This matches your existing category “${resolved}” and will be saved under that name.`;
  } else {
    hint = "An existing category.";
  }

  return (
    <Field label="Category" htmlFor={id} error={error} hint={hint}>
      <Input
        id={id}
        name="category"
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        // Select the text on focus so typing replaces it and the list shows everything.
        onFocus={(event) => event.target.select()}
        maxLength={80}
        placeholder="Choose or type a category"
      />
      <datalist id={listId}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </Field>
  );
}
