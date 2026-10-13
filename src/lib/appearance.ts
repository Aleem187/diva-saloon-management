/**
 * The look of a salon's dashboard: which colour scheme, fonts and text size.
 *
 * These are the values the `data-theme`, `data-font-heading`, `data-font-body`
 * and `data-text-size` attributes take, and each has a matching block in
 * `globals.css`. Phase 1 hard-codes the defaults; a later phase reads them
 * from the database.
 *
 * Not a "use client" module: the server layout and the client dev page both
 * need it (CLAUDE.md rule 9).
 */
export const THEMES = ["plum", "sage", "ocean", "rose", "terra", "midnight"] as const;
export const HEADING_FONTS = ["sora", "playfair", "dmserif", "poppins"] as const;
export const BODY_FONTS = ["figtree", "nunito", "lato", "source"] as const;
export const TEXT_SIZES = ["s", "m", "l"] as const;

export type ThemeName = (typeof THEMES)[number];
export type HeadingFont = (typeof HEADING_FONTS)[number];
export type BodyFont = (typeof BODY_FONTS)[number];
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Appearance {
  theme: ThemeName;
  fontHeading: HeadingFont;
  fontBody: BodyFont;
  textSize: TextSize;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "plum",
  fontHeading: "sora",
  fontBody: "figtree",
  textSize: "m",
};

/** What each option is called and how it is described in Settings > Appearance. */
export const THEME_META: Record<ThemeName, { name: string; hint: string }> = {
  plum: { name: "Plum", hint: "Default · warm and calm" },
  sage: { name: "Sage", hint: "Fresh, spa-like" },
  ocean: { name: "Ocean", hint: "Clean and clinical" },
  rose: { name: "Rose", hint: "Bold and beauty-led" },
  terra: { name: "Terracotta", hint: "Earthy and warm" },
  midnight: { name: "Midnight", hint: "Cool and modern" },
};

export const HEADING_FONT_META: Record<
  HeadingFont,
  { name: string; hint: string; css: string }
> = {
  sora: { name: "Sora", hint: "Modern", css: "var(--font-sora), sans-serif" },
  playfair: { name: "Playfair Display", hint: "Elegant serif", css: "var(--font-playfair), serif" },
  dmserif: { name: "DM Serif Display", hint: "Classic", css: "var(--font-dmserif), serif" },
  poppins: { name: "Poppins", hint: "Friendly", css: "var(--font-poppins), sans-serif" },
};

export const BODY_FONT_META: Record<BodyFont, { name: string; css: string }> = {
  figtree: { name: "Figtree", css: "var(--font-figtree), sans-serif" },
  nunito: { name: "Nunito Sans", css: "var(--font-nunito), sans-serif" },
  lato: { name: "Lato", css: "var(--font-lato), sans-serif" },
  source: { name: "Source Sans 3", css: "var(--font-source), sans-serif" },
};

export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  s: "Small",
  m: "Default",
  l: "Large",
};

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/**
 * A salon's saved appearance, with anything missing or unrecognised replaced by
 * the default. The columns come from the database and are constrained there,
 * but this also covers a deployment where the migration has not been applied
 * yet, so the dashboard never renders with an undefined theme.
 */
export function normaliseAppearance(
  salon: Partial<Record<"theme" | "font_heading" | "font_body" | "text_size", unknown>>,
): Appearance {
  return {
    theme: pick(THEMES, salon.theme, DEFAULT_APPEARANCE.theme),
    fontHeading: pick(HEADING_FONTS, salon.font_heading, DEFAULT_APPEARANCE.fontHeading),
    fontBody: pick(BODY_FONTS, salon.font_body, DEFAULT_APPEARANCE.fontBody),
    textSize: pick(TEXT_SIZES, salon.text_size, DEFAULT_APPEARANCE.textSize),
  };
}
