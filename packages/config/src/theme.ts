/**
 * Brand tokens, lifted from the web client so the Android app inherits one
 * identity instead of growing a second one.
 *
 * Source of truth: `apps/web/src/index.css` (base, accent, font) and the
 * glass/border conventions used across the existing pages. React Native has no
 * Tailwind, so the values the web expresses as utility classes are named here.
 */

export const COLORS = {
  /** App background. `body { background: #020617 }`. */
  bg: "#020617",
  /** Page surface used by the citizen screens. */
  surface: "#050816",
  /** Card fills — the "glass" look, over the dark background. */
  glass: "rgba(255,255,255,0.05)",
  glassStrong: "rgba(255,255,255,0.08)",
  /** Hairlines. */
  line: "rgba(255,255,255,0.10)",
  lineStrong: "rgba(255,255,255,0.16)",

  text: "#ffffff",
  textMuted: "#94a3b8",
  textFaint: "#64748b",

  /** The signature accent. Gradients run cyan → blue. */
  cyan: "#06b6d4",
  cyanLight: "#22d3ee",
  blue: "#2563eb",
  blueLight: "#3b82f6",

  /** Semantic, aligned with the risk palette in ./risk.ts. */
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  dangerDeep: "#b91c1c",
} as const;

/** The accent gradient, as a stop array for expo-linear-gradient. */
export const ACCENT_GRADIENT = [COLORS.cyanLight, COLORS.blue] as const;
export const DANGER_GRADIENT = ["#f87171", "#dc2626"] as const;

/** Corner radii. The web uses rounded-2xl / rounded-[1.75rem] most places. */
export const RADIUS = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

/** 4-point spacing scale, matching the web's Tailwind rhythm. */
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

/**
 * Inter, the web's typeface. On mobile it must be loaded with expo-font; the
 * family names below are what `useFonts` registers.
 */
export const FONTS = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
  black: "Inter_900Black",
} as const;

/** Type scale, tuned for a 390pt-wide phone. */
export const TYPE = {
  display: { size: 26, lineHeight: 30, font: FONTS.black },
  h1: { size: 20, lineHeight: 26, font: FONTS.extrabold },
  h2: { size: 17, lineHeight: 23, font: FONTS.bold },
  h3: { size: 14, lineHeight: 20, font: FONTS.bold },
  body: { size: 13, lineHeight: 20, font: FONTS.regular },
  small: { size: 12, lineHeight: 18, font: FONTS.regular },
  tiny: { size: 10, lineHeight: 15, font: FONTS.medium },
  /** Uppercase section labels. */
  label: { size: 10, lineHeight: 14, font: FONTS.bold, letterSpacing: 0.9 },
} as const;
