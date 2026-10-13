import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { DEFAULT_APPEARANCE, type Appearance } from "@/lib/appearance";
import { fontVariables } from "@/lib/fonts";

/**
 * The element the colour scheme, fonts and text size hang from.
 *
 * `data-theme`, `data-font-heading`, `data-font-body` and `data-text-size`
 * select the blocks in globals.css; the font classes define the variables those
 * blocks point at. Both have to be on the same element, so they are set
 * together here.
 *
 * Phase 1: callers pass nothing and get the defaults. A later phase passes the
 * salon's saved appearance.
 */
export function ThemeRoot({
  appearance = DEFAULT_APPEARANCE,
  className,
  children,
}: {
  appearance?: Appearance;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // Settings > Appearance finds this to preview a choice before it is saved.
      data-appearance-root=""
      data-theme={appearance.theme}
      data-font-heading={appearance.fontHeading}
      data-font-body={appearance.fontBody}
      data-text-size={appearance.textSize}
      className={cn(fontVariables, "bg-page leading-[1.45] text-ink", className)}
    >
      {children}
    </div>
  );
}
