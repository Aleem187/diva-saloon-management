import type { ReactNode } from "react";

import { tabDomIds, type TabParam } from "@/lib/tabs";

/**
 * The container for the active tab's content. Its id and label tie it to the
 * tab that opened it, which is what lets a screen reader say "Profile panel".
 * Render exactly one, for the active tab -- the others are not rendered.
 */
export function TabPanel({
  id,
  param = "tab",
  children,
}: {
  id: string;
  param?: TabParam;
  children: ReactNode;
}) {
  const ids = tabDomIds(param, id);
  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab}>
      {children}
    </div>
  );
}
