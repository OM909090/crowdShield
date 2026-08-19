import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ACCENT_GRADIENT, COLORS, DANGER_GRADIENT, RADIUS, s, t, tint } from "./theme";

/**
 * Screen chrome: safe area, dark background, optional scroll.
 *
 * Uses `useSafeAreaInsets` rather than `SafeAreaView` so the inset is applied as
 * padding we control, since a component that insets all four edges fights the
 * full-bleed map.
 *
 * The bottom inset is applied here too. It used to be skipped on the assumption
 * that the tab bar absorbed it, which is only true for tabbed screens — and even
 * there the tab bar pins its own height. On the screens that matter most (login,
 * signup, consent) there is no tab bar at all, so the footer button was sitting
 * under the gesture pill, and the last row of a long list scrolled to a position
 * the thumb could not comfortably reach.
 */
export function Screen({
  children,
  scroll = true,
  footer,
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            s.scroll,
            // Only pad for the gesture area when nothing else will: a footer sits
            // below the scroll view and takes that job itself.
            footer ? null : { paddingBottom: 28 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.grow, { paddingHorizontal: 16 }]}>{children}</View>
      )}
      {footer ? (
        <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8 }}>{footer}</View>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  tone,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Tints the card with a level colour, for a situation or alert card. */
  readonly tone?: string;
}) {
  return (
    <View
      style={[
        s.card,
        tone ? { borderColor: tint(tone, 0.3), backgroundColor: tint(tone, 0.08) } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: { readonly children: ReactNode }) {
  return <Text style={t.label}>{children}</Text>;
}

/** Coloured status chip. `tone` is a level hex from @crowdshield/config. */
export function Badge({ children, tone }: { readonly children: ReactNode; readonly tone: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tint(tone, 0.3),
        backgroundColor: tint(tone, 0.12),
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: RADIUS.pill,
      }}
    >
      <Text style={{ color: tone, fontSize: 10, fontWeight: "700" }}>{children}</Text>
    </View>
  );
}

export function Pill({
  children,
  tone,
  onPress,
}: {
  readonly children: ReactNode;
  readonly tone?: string;
  readonly onPress?: () => void;
}) {
  const body = (
    <View
      style={[
        s.pill,
        tone ? { borderColor: tint(tone, 0.3), backgroundColor: tint(tone, 0.12) } : null,
      ]}
    >
      {typeof children === "string" ? (
        <Text style={{ color: tone ?? "#cbd5e1", fontSize: 11, fontWeight: "600" }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const textStyle: TextStyle = {
    fontSize: variant === "danger" ? 15 : 14,
    fontWeight: variant === "danger" ? "800" : "700",
    color: variant === "ghost" ? "#e2e8f0" : variant === "danger" ? "#fff" : "#02121a",
  };

  const content = loading ? (
    <ActivityIndicator color={variant === "ghost" ? "#e2e8f0" : "#02121a"} size="small" />
  ) : (
    <Text style={textStyle}>{label}</Text>
  );

  if (variant === "ghost") {
    return (
      <Pressable
        onPress={inactive ? undefined : onPress}
        style={[s.button, s.buttonGhost, inactive && { opacity: 0.45 }, style]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={inactive ? undefined : onPress} style={[inactive && { opacity: 0.45 }, style]}>
      <LinearGradient
        colors={variant === "danger" ? [...DANGER_GRADIENT] : [...ACCENT_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.button}
      >
        {content}
      </LinearGradient>
    </Pressable>
  );
}

/** A tappable row in a settings-style list. */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly right?: ReactNode;
  readonly onPress?: () => void;
  readonly danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.card, s.cardTight, { flexDirection: "row", alignItems: "center", gap: 10 }]}
    >
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: tint(COLORS.cyanLight, 0.2),
            backgroundColor: tint(COLORS.cyanLight, 0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
      ) : null}
      <View style={s.grow}>
        <Text style={[t.h3, danger && { color: "#fca5a5" }]}>{title}</Text>
        {subtitle ? <Text style={t.tiny}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Toggle({ on }: { readonly on: boolean }) {
  return (
    <View
      style={{
        width: 38,
        height: 22,
        borderRadius: RADIUS.pill,
        backgroundColor: on ? COLORS.cyan : "rgba(255,255,255,0.14)",
        justifyContent: "center",
        paddingHorizontal: 3,
        alignItems: on ? "flex-end" : "flex-start",
      }}
    >
      <View style={{ width: 16, height: 16, borderRadius: 99, backgroundColor: on ? "#02121a" : "#94a3b8" }} />
    </View>
  );
}

/** Centred state for loading / empty / error. */
export function Centered({
  emoji,
  title,
  body,
  children,
}: {
  readonly emoji?: string;
  readonly title?: string;
  readonly body?: string;
  readonly children?: ReactNode;
}) {
  return (
    <View style={[s.grow, s.center, { gap: 12, paddingHorizontal: 24 }]}>
      {emoji ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: tint(COLORS.cyanLight, 0.3),
            backgroundColor: tint(COLORS.cyanLight, 0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 32 }}>{emoji}</Text>
        </View>
      ) : null}
      {title ? <Text style={[t.h1, { textAlign: "center" }]}>{title}</Text> : null}
      {body ? <Text style={[t.body, { textAlign: "center" }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function Spinner({ label }: { readonly label?: string }) {
  return (
    <View style={[s.grow, s.center, { gap: 10 }]}>
      <ActivityIndicator color={COLORS.cyanLight} />
      {label ? <Text style={t.small}>{label}</Text> : null}
    </View>
  );
}

/** Full-width notice. Used for announcements and the offline banner. */
export function Banner({
  tone,
  children,
}: {
  readonly tone: string;
  readonly children: ReactNode;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tint(tone, 0.32),
        backgroundColor: tint(tone, 0.13),
        borderRadius: RADIUS.md,
        padding: 12,
        gap: 7,
      }}
    >
      {children}
    </View>
  );
}
