import { StyleSheet } from "react-native";
import { COLORS, RADIUS, SPACING, TYPE } from "@crowdshield/config";

export { ACCENT_GRADIENT, COLORS, DANGER_GRADIENT, FONTS, RADIUS, SPACING, TYPE } from "@crowdshield/config";

/**
 * Style primitives that map 1:1 onto the web client's Tailwind conventions, so a
 * card here and a card there are the same object rather than two designers'
 * guesses. Tokens live in `@crowdshield/config` (shared with the web);
 * this file is only the React Native expression of them.
 */
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: 28, gap: 11 },

  /** The glass card used everywhere. `border border-white/10 bg-white/5`. */
  card: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: 8,
  },
  cardTight: { padding: 12, gap: 6 },

  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  grow: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },

  /** Pill / chip. */
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.glass,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },

  /** Primary action. Rendered with a LinearGradient behind it. */
  button: {
    height: 50,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.glass,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: TYPE.body.size,
  },

  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 2 },
});

/** Text styles. Applied as `style={[t.h2, { color: ... }]}`. */
export const t = StyleSheet.create({
  display: { fontSize: TYPE.display.size, lineHeight: TYPE.display.lineHeight, fontWeight: "900", color: COLORS.text, letterSpacing: -0.5 },
  h1: { fontSize: TYPE.h1.size, lineHeight: TYPE.h1.lineHeight, fontWeight: "800", color: COLORS.text, letterSpacing: -0.2 },
  h2: { fontSize: TYPE.h2.size, lineHeight: TYPE.h2.lineHeight, fontWeight: "700", color: COLORS.text },
  h3: { fontSize: TYPE.h3.size, lineHeight: TYPE.h3.lineHeight, fontWeight: "700", color: COLORS.text },
  body: { fontSize: TYPE.body.size, lineHeight: TYPE.body.lineHeight, color: "#cbd5e1" },
  small: { fontSize: TYPE.small.size, lineHeight: TYPE.small.lineHeight, color: COLORS.textMuted },
  tiny: { fontSize: TYPE.tiny.size, lineHeight: TYPE.tiny.lineHeight, color: COLORS.textFaint },
  label: {
    fontSize: TYPE.label.size,
    lineHeight: TYPE.label.lineHeight,
    fontWeight: "700",
    letterSpacing: TYPE.label.letterSpacing,
    color: COLORS.textFaint,
    textTransform: "uppercase",
  },
});

/** Translucent tint of a level colour, for a badge background. */
export const tint = (hex: string, alpha = 0.12): string => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
