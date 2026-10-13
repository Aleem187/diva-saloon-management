import { Suspense } from "react";

import { FlashBanner } from "@/components/ui/flash-banner";
import { readFlash } from "@/lib/flash";

async function PendingFlash() {
  const flash = await readFlash();
  return flash ? <FlashBanner tone={flash.tone} message={flash.message} /> : null;
}

/**
 * Put this near the top of any page whose Server Actions may call
 * `redirectWithFlash`. It renders nothing when there is no message.
 */
export function PageFlash() {
  return (
    <Suspense fallback={null}>
      <PendingFlash />
    </Suspense>
  );
}
