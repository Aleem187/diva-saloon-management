"use client";

import { useEffect, useState } from "react";

import { Flash, type FlashTone } from "./flash";

/**
 * Shows a flash message read from the cookie (see `@/lib/flash`) and clears the
 * cookie in the browser so a refresh does not show it again. The visitor can
 * also dismiss it.
 */
export function FlashBanner({ tone, message }: { tone: FlashTone; message: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    document.cookie = "flash=; Max-Age=0; Path=/; SameSite=Lax";
  }, []);

  if (!open) return null;

  return (
    <Flash tone={tone} onDismiss={() => setOpen(false)}>
      {message}
    </Flash>
  );
}
