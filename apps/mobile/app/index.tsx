import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { useApp } from "../src/state/AppProvider";
import { COLORS, s, t } from "../src/theme";
import { Centered } from "../src/ui";

/**
 * The one place that decides where a cold start lands.
 *
 * Keeping every branch here — rather than sprinkling redirects through the
 * screens — means the boot order is readable in one screenful: language, then
 * session, then event, then the app.
 */
export default function Boot() {
  const { ready, needsLanguage, authChecked, user, event, t: tr } = useApp();

  // Splash: waiting on stored language and the session probe.
  if (!ready || !authChecked) {
    return (
      <View style={[s.screen, { justifyContent: "center" }]}>
        <Centered emoji="🛡" title="CrowdShield" body={tr("tagline")} />
        <View style={{ paddingBottom: 40, alignItems: "center", gap: 6 }}>
          <Text style={t.small}>{tr("restoring")}</Text>
          <Text style={[t.tiny, { color: COLORS.textFaint }]}>
            {tr("b1")}
          </Text>
        </View>
      </View>
    );
  }

  // Language before anything readable, so a first-run screen is never in a
  // language the person cannot read.
  if (needsLanguage) return <Redirect href="/language" />;
  if (!user) return <Redirect href="/login" />;
  if (!event) return <Redirect href="/events" />;
  return <Redirect href="/(tabs)" />;
}
