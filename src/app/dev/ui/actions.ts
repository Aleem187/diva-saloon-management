"use server";

import { requireSession } from "@/lib/auth/session";
import { redirectWithFlash } from "@/lib/flash";
import type { FlashTone } from "@/components/ui/flash";

const TONES: FlashTone[] = ["success", "error", "warning", "info"];

/** Dev-only: proves a Server Action can redirect back with a flash message. */
export async function demoFlashAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Not available.");
  await requireSession();

  const raw = String(formData.get("tone") ?? "success");
  const tone = TONES.find((t) => t === raw) ?? "success";

  // Back to the same tab, with the message.
  await redirectWithFlash("/dev/ui", tone, `This is a ${tone} flash, shown after a redirect.`, {
    tab: String(formData.get("tab") ?? "") || undefined,
  });
}
