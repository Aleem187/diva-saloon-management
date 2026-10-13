"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { normaliseAppearance } from "@/lib/appearance";
import { assertModule, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, salonSettingsSchema } from "@/lib/validation";
import { submittedValues } from "@/lib/form-values";
import type { BusinessHours, Json } from "@/lib/types/database";

export interface SettingsFormState {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
  /** Echoed back so a rejected form is not wiped -- see submittedValues(). */
  values?: Record<string, string>;
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function readBusinessHours(formData: FormData): BusinessHours {
  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      {
        open: String(formData.get(`hours.${day}.open`) ?? "09:00"),
        close: String(formData.get(`hours.${day}.close`) ?? "18:00"),
        closed: formData.get(`hours.${day}.closed`) === "on",
      },
    ]),
  ) as BusinessHours;
}

/**
 * Salon profile and loyalty configuration.
 *
 * The loyalty earn rate is stored as a fraction on `salon_settings` so the 5%
 * default is never hardcoded in application code -- Phase 4's earn calculation
 * reads it from here, server-side.
 */
export async function updateSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireSession();

  try {
    assertModule(session, "settings");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = salonSettingsSchema.safeParse({
    salonName: formData.get("salonName"),
    businessType: formData.get("businessType"),
    country: formData.get("country"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    loyaltyEarnRatePercent: formData.get("loyaltyEarnRatePercent"),
    // Absent from a request that does not carry them; see the schema.
    theme: formData.get("theme") ?? undefined,
    fontHeading: formData.get("fontHeading") ?? undefined,
    fontBody: formData.get("fontBody") ?? undefined,
    textSize: formData.get("textSize") ?? undefined,
    businessHours: readBusinessHours(formData),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: submittedValues(formData) };
  }

  const input = parsed.data;
  const supabase = await createClient();
  const salonId = session.profile.salon_id;

  const { data: before } = await supabase
    .from("salon_settings")
    .select("loyalty_earn_rate")
    .eq("salon_id", salonId)
    .maybeSingle();

  const loyaltyEarnRate = Number((input.loyaltyEarnRatePercent / 100).toFixed(4));

  /*
   * Appearance. `session.salon` is read fresh on every request, so it is the
   * "before". The columns only exist once migration 20260924000038 has been
   * applied; until then there is nothing to write, and the rest of the form
   * must still save.
   */
  const appearanceSupported = "theme" in session.salon;
  const appearanceBefore = normaliseAppearance(session.salon);
  const appearanceAfter = {
    theme: input.theme ?? appearanceBefore.theme,
    fontHeading: input.fontHeading ?? appearanceBefore.fontHeading,
    fontBody: input.fontBody ?? appearanceBefore.fontBody,
    textSize: input.textSize ?? appearanceBefore.textSize,
  };
  const appearanceChanged =
    appearanceSupported &&
    (appearanceAfter.theme !== appearanceBefore.theme ||
      appearanceAfter.fontHeading !== appearanceBefore.fontHeading ||
      appearanceAfter.fontBody !== appearanceBefore.fontBody ||
      appearanceAfter.textSize !== appearanceBefore.textSize);

  const { error: salonError } = await supabase
    .from("salons")
    .update({
      name: input.salonName,
      business_type: input.businessType,
      country: input.country,
      timezone: input.timezone,
      currency: input.currency,
      ...(appearanceChanged
        ? {
            theme: appearanceAfter.theme,
            font_heading: appearanceAfter.fontHeading,
            font_body: appearanceAfter.fontBody,
            text_size: appearanceAfter.textSize,
          }
        : {}),
    })
    .eq("id", salonId);

  if (salonError) {
    return { message: salonError.message };
  }

  // Upsert rather than update: a salon created before salon_settings existed,
  // or one whose settings row was removed, still lands somewhere sensible.
  const { error: settingsError } = await supabase.from("salon_settings").upsert(
    {
      salon_id: salonId,
      loyalty_earn_rate: loyaltyEarnRate,
      business_hours: input.businessHours,
    },
    { onConflict: "salon_id" },
  );

  if (settingsError) {
    return { message: settingsError.message };
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.SALON_SETTINGS_CHANGED,
    entityType: "salon",
    entityId: salonId,
    metadata: {
      name: input.salonName,
      business_type: input.businessType,
      timezone: input.timezone,
      currency: input.currency,
      loyalty_earn_rate_from: (before?.loyalty_earn_rate ?? null) as Json,
      loyalty_earn_rate_to: loyaltyEarnRate,
    },
  });

  if (appearanceChanged) {
    await logAudit(session, {
      action: AUDIT_ACTIONS.SALON_APPEARANCE_UPDATED,
      entityType: "salon",
      entityId: salonId,
      metadata: { before: { ...appearanceBefore }, after: { ...appearanceAfter } },
    });
  }

  revalidatePath("/dashboard", "layout");
  return { success: "Settings saved." };
}
