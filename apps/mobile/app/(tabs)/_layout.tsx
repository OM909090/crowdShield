import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../src/theme";
import { useApp } from "../../src/state/AppProvider";

/**
 * React Native's ColorValue allows a processed colour (a number) and null, while
 * the icon font only takes a string. Narrow once here rather than casting at
 * five call sites.
 */
const iconColor = (color: unknown): string =>
  typeof color === "string" ? color : COLORS.textFaint;

/**
 * Bottom tabs, replacing the web client's single scrolling page.
 *
 * The web citizen page stacks situation, alerts, destinations, exit, SOS and
 * reporting into one column. On a phone that buries the SOS button three folds
 * down — so the surfaces are split and SOS is reachable from every one of them.
 */
export default function TabsLayout() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.cyanLight,
        tabBarInactiveTintColor: COLORS.textFaint,
        // Naming an explicit `height` opts out of the automatic safe-area
        // handling, so the inset has to be added back by hand. Without it the
        // labels are squeezed against the gesture pill on a gesture-navigation
        // device, which is most of them.
        tabBarStyle: {
          backgroundColor: "rgba(2,6,23,0.96)",
          borderTopColor: COLORS.line,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        sceneStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabHome"),
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size - 2} color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t("tabMap"),
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size - 2} color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="go"
        options={{
          title: t("tabGo"),
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" size={size - 2} color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t("tabAssistant"),
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size - 2} color={iconColor(color)} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tabMore"),
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size - 2} color={iconColor(color)} />,
        }}
      />
    </Tabs>
  );
}
