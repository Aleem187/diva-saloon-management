import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { FlashTone } from "@/components/ui/flash";

/*
 * Flash messages across a redirect.
 *
 * A Server Action that finishes by sending the visitor back to a page calls
 * `redirectWithFlash`; the page renders `<PageFlash />`, which reads the
 * message and shows it in the Flash component.
 *
 * The message travels in a short-lived cookie, not the URL. A URL parameter
 * would let anyone craft a link that shows an arbitrary "Your account has been
 * suspended, call ..." banner inside the app. A cookie can only be set by the
 * visitor's own browser or by our own action.
 *
 * It is not httpOnly on purpose: the banner clears it from the browser once
 * shown (a Server Component cannot delete a cookie), so a refresh does not
 * show it again. It expires after a minute regardless.
 */

export const FLASH_COOKIE = "flash";
const MAX_LENGTH = 300;

export interface FlashMessage {
  tone: FlashTone;
  message: string;
}

const TONES: FlashTone[] = ["success", "error", "warning", "info"];

/**
 * Redirect back to `path` (a path in this app) keeping `query` -- typically
 * `{ tab: "profile" }` -- with a message to show there. Never returns.
 *
 * Only for Server Actions and route handlers: it sets a cookie.
 */
export async function redirectWithFlash(
  path: string,
  tone: FlashTone,
  message: string,
  query: Record<string, string | undefined> = {},
): Promise<never> {
  // Only ever redirect within this app, as /auth/confirm does.
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("redirectWithFlash needs a path within the app.");
  }

  const store = await cookies();
  store.set(FLASH_COOKIE, JSON.stringify({ tone, message: message.slice(0, MAX_LENGTH) }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  redirect(qs ? `${path}?${qs}` : path);
}

/** The pending message, if there is a valid one. Does not clear it. */
export async function readFlash(): Promise<FlashMessage | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { tone, message } = parsed as Record<string, unknown>;
    if (typeof message !== "string" || !TONES.includes(tone as FlashTone)) return null;
    return { tone: tone as FlashTone, message: message.slice(0, MAX_LENGTH) };
  } catch {
    return null;
  }
}
