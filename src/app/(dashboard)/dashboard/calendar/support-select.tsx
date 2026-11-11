"use client";

import { useState } from "react";

import { Field, Select } from "@/components/ui/field";
import { MAX_SUPPORT_STAFF } from "@/lib/types/database";

/**
 * The Support / Assistants part of an appointment's team: up to two more people
 * besides the Primary Lead, each optional. Nobody here can cause a conflict, so
 * there is no availability check on these; the only rules are that the lead is
 * not also support and nobody is chosen twice, so each box leaves out the lead
 * and the other box's choice.
 *
 * Submits `supportStaffId` once per box (blank when empty).
 */
export function SupportSelects({
  idPrefix,
  people,
  leadId,
  defaultIds = [],
  error,
}: {
  idPrefix: string;
  people: { id: string; name: string }[];
  /** The Primary Lead's id, or "" before one is chosen. */
  leadId: string;
  defaultIds?: string[];
  error?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    Array.from({ length: MAX_SUPPORT_STAFF }, (_, i) => defaultIds[i] ?? ""),
  );

  function pick(index: number, id: string) {
    setChosen((current) => current.map((value, i) => (i === index ? id : value)));
  }

  return (
    <div className="space-y-3">
      {chosen.map((value, index) => {
        const taken = new Set(chosen.filter((_, i) => i !== index));
        // A lead chosen after a support person: that person simply stops counting.
        const effective = value && value !== leadId ? value : "";
        return (
          <Field
            key={index}
            label={`Support / assistant ${index + 1}`}
            htmlFor={`${idPrefix}-support-${index}`}
            hint={
              index === 0
                ? "Optional. Helps the lead; never blocks the booking, even if busy elsewhere."
                : undefined
            }
            error={index === 0 ? error : undefined}
          >
            <Select
              id={`${idPrefix}-support-${index}`}
              name="supportStaffId"
              value={effective}
              onChange={(event) => pick(index, event.target.value)}
            >
              <option value="">None</option>
              {people
                .filter((p) => p.id !== leadId && !taken.has(p.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </Select>
          </Field>
        );
      })}
    </div>
  );
}
