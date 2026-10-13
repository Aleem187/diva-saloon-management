import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";

/**
 * A collapsed edit panel. Built on <details> so it works without JavaScript
 * and needs no open/closed state of its own.
 */
export function EditDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className={`${buttonClasses({ variant: "ghost", size: "sm" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        {label}
      </summary>
      <div className="mt-3 rounded-[10px] border border-line bg-head p-4">{children}</div>
    </details>
  );
}
