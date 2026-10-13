import {
  DM_Serif_Display,
  Figtree,
  Lato,
  Nunito_Sans,
  Playfair_Display,
  Poppins,
  Sora,
  Source_Sans_3,
} from "next/font/google";

/*
 * Every font the Appearance settings can offer, self-hosted by next/font.
 *
 * Each one only declares a CSS variable (`--font-sora`, ...); which one the
 * UI uses is decided by the `data-font-heading` / `data-font-body` selectors in
 * globals.css, which point `--font-heading` / `--font-body` at one of them.
 *
 * Loading: a browser downloads a @font-face file only when text actually uses
 * it, so declaring all eight costs nothing until a salon picks one. The
 * defaults (Sora, Figtree) are preloaded; the other six are not, so they never
 * add a <link rel="preload"> to a page that does not use them.
 *
 * Fonts without a variable build need explicit weights: DM Serif Display ships
 * a single weight, Poppins and Lato are static families.
 */
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dmserif",
  display: "swap",
  preload: false,
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
});
const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
  preload: false,
});
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
  preload: false,
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
  display: "swap",
  preload: false,
});

/** Class names that define all eight font variables. Apply on the theme root. */
export const fontVariables = [
  sora,
  figtree,
  playfair,
  dmSerif,
  poppins,
  nunito,
  lato,
  sourceSans,
].map((f) => f.variable).join(" ");
