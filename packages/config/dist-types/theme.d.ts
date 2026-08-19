/**
 * Brand tokens, lifted from the web client so the Android app inherits one
 * identity instead of growing a second one.
 *
 * Source of truth: `apps/web/src/index.css` (base, accent, font) and the
 * glass/border conventions used across the existing pages. React Native has no
 * Tailwind, so the values the web expresses as utility classes are named here.
 */
export declare const COLORS: {
    /** App background. `body { background: #020617 }`. */
    readonly bg: "#020617";
    /** Page surface used by the citizen screens. */
    readonly surface: "#050816";
    /** Card fills — the "glass" look, over the dark background. */
    readonly glass: "rgba(255,255,255,0.05)";
    readonly glassStrong: "rgba(255,255,255,0.08)";
    /** Hairlines. */
    readonly line: "rgba(255,255,255,0.10)";
    readonly lineStrong: "rgba(255,255,255,0.16)";
    readonly text: "#ffffff";
    readonly textMuted: "#94a3b8";
    readonly textFaint: "#64748b";
    /** The signature accent. Gradients run cyan → blue. */
    readonly cyan: "#06b6d4";
    readonly cyanLight: "#22d3ee";
    readonly blue: "#2563eb";
    readonly blueLight: "#3b82f6";
    /** Semantic, aligned with the risk palette in ./risk.ts. */
    readonly success: "#22c55e";
    readonly warning: "#f59e0b";
    readonly danger: "#ef4444";
    readonly dangerDeep: "#b91c1c";
};
/** The accent gradient, as a stop array for expo-linear-gradient. */
export declare const ACCENT_GRADIENT: readonly ["#22d3ee", "#2563eb"];
export declare const DANGER_GRADIENT: readonly ["#f87171", "#dc2626"];
/** Corner radii. The web uses rounded-2xl / rounded-[1.75rem] most places. */
export declare const RADIUS: {
    readonly sm: 10;
    readonly md: 16;
    readonly lg: 22;
    readonly xl: 28;
    readonly pill: 999;
};
/** 4-point spacing scale, matching the web's Tailwind rhythm. */
export declare const SPACING: {
    readonly xs: 4;
    readonly sm: 8;
    readonly md: 12;
    readonly lg: 16;
    readonly xl: 20;
    readonly xxl: 28;
};
/**
 * Inter, the web's typeface. On mobile it must be loaded with expo-font; the
 * family names below are what `useFonts` registers.
 */
export declare const FONTS: {
    readonly regular: "Inter_400Regular";
    readonly medium: "Inter_500Medium";
    readonly semibold: "Inter_600SemiBold";
    readonly bold: "Inter_700Bold";
    readonly extrabold: "Inter_800ExtraBold";
    readonly black: "Inter_900Black";
};
/** Type scale, tuned for a 390pt-wide phone. */
export declare const TYPE: {
    readonly display: {
        readonly size: 26;
        readonly lineHeight: 30;
        readonly font: "Inter_900Black";
    };
    readonly h1: {
        readonly size: 20;
        readonly lineHeight: 26;
        readonly font: "Inter_800ExtraBold";
    };
    readonly h2: {
        readonly size: 17;
        readonly lineHeight: 23;
        readonly font: "Inter_700Bold";
    };
    readonly h3: {
        readonly size: 14;
        readonly lineHeight: 20;
        readonly font: "Inter_700Bold";
    };
    readonly body: {
        readonly size: 13;
        readonly lineHeight: 20;
        readonly font: "Inter_400Regular";
    };
    readonly small: {
        readonly size: 12;
        readonly lineHeight: 18;
        readonly font: "Inter_400Regular";
    };
    readonly tiny: {
        readonly size: 10;
        readonly lineHeight: 15;
        readonly font: "Inter_500Medium";
    };
    /** Uppercase section labels. */
    readonly label: {
        readonly size: 10;
        readonly lineHeight: 14;
        readonly font: "Inter_700Bold";
        readonly letterSpacing: 0.9;
    };
};
