"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * The directory's search box. Still a plain GET form, so Enter, the Search
 * button and a browser without scripts all work and the result is a linkable
 * URL; on top of that the list follows the box 300ms after typing pauses, so a
 * name or number is found without reaching for the button.
 *
 * Each pause is one server render of the directory (50 rows, trigram-indexed),
 * not one per keystroke.
 */
export function DirectorySearch({ q }: { q: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();
  const debounced = useDebouncedValue(value);

  useEffect(() => {
    const next = debounced.trim();
    if (next === q) return;
    startTransition(() => {
      router.replace(next ? `/dashboard/customers?q=${encodeURIComponent(next)}` : "/dashboard/customers", {
        scroll: false,
      });
    });
    // `q` is the URL's current value; the effect exists to move it towards `debounced`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <form className="flex flex-wrap items-end gap-3">
      <TextField
        label="Phone number or name"
        id="q"
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="0300 123 4567"
        autoComplete="off"
        hint={pending ? "Searching..." : undefined}
        className="min-w-56 flex-1"
      />
      <Button type="submit">Search</Button>
      {q || value ? (
        <Button type="button" variant="ghost" onClick={() => setValue("")}>
          Clear
        </Button>
      ) : null}
    </form>
  );
}
