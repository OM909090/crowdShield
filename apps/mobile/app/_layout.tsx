import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { COLORS } from "../src/theme";
import { AppProvider } from "../src/state/AppProvider";
import { FeedProvider } from "../src/state/FeedProvider";

/**
 * Root layout. Providers only — routing decisions live in `app/index.tsx`, so
 * this file has no reason to change as screens are added.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        {/* One live feed for every screen: a single socket that stays connected
            as long as an event is joined, so alerts and announcements reach the
            citizen on any tab instead of only while Home or Map is open. */}
        <FeedProvider>
        {/* Edge-to-edge is on, so the bar colour comes from the screen behind it. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.surface },
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="language" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="server" />
          <Stack.Screen name="events" />
          <Stack.Screen name="consent" />
          <Stack.Screen name="(tabs)" />
          {/* Anything that interrupts: presented over the tabs, dismissible. */}
          <Stack.Screen name="sos" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="report" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="update" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack>
        </FeedProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
