import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { COLORS } from "@crowdshield/config";
import { useApp } from "../src/state/AppProvider";
import { s, t, tint } from "../src/theme";
import { Banner, Button, Card, Screen } from "../src/ui";

/**
 * Explicit, itemised, refusable consent before the phone becomes a sensor.
 *
 * Declining is a first-class path, not a dead end: alerts and announcements still
 * work, only personal routing is lost. A consent screen whose "no" button leaves
 * you with nothing is not consent, and data ethics carries real weight in how
 * this product is judged — and in whether anyone at a festival trusts it.
 */
export default function ConsentScreen() {
  const { t: tr, event, startSharing } = useApp();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    // Route onward whatever the answer: declining at the OS prompt, or location
    // services being switched off (which makes the watch reject), are both valid
    // outcomes. try/finally guarantees we never strand the user on this screen
    // with a spinner — they can always reach alerts and SOS.
    try {
      await startSharing();
    } finally {
      setBusy(false);
      router.replace("/(tabs)");
    }
  };

  const browse = () => router.replace("/(tabs)");

  const bullets = [
    { icon: "🕶", text: tr("b1") },
    { icon: "⬡", text: tr("b2") },
    { icon: "⏹", text: tr("b3") },
  ];

  return (
    <Screen
      footer={
        <>
          <Button label={tr("shareBtn")} onPress={share} loading={busy} />
          <Button label={tr("browseBtn")} variant="ghost" onPress={browse} />
        </>
      }
    >
      <View style={{ height: 10 }} />
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 19,
          borderWidth: 1,
          borderColor: tint(COLORS.cyanLight, 0.3),
          backgroundColor: tint(COLORS.cyanLight, 0.1),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 26 }}>🔒</Text>
      </View>

      <Text style={[t.h1, { marginTop: 13 }]}>{tr("consentTitle")}</Text>
      <Text style={[t.body, { marginTop: 6 }]}>{tr("consentBody")}</Text>

      <View style={{ gap: 8, marginTop: 14 }}>
        {bullets.map((bullet) => (
          <Card key={bullet.icon} style={s.cardTight}>
            <View style={s.row}>
              <Text style={{ fontSize: 17 }}>{bullet.icon}</Text>
              <Text style={[t.small, s.grow]}>{bullet.text}</Text>
            </View>
          </Card>
        ))}
      </View>

      <View style={{ marginTop: 12 }}>
        <Banner tone={COLORS.cyanLight}>
          <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("consentWhy")}</Text>
        </Banner>
      </View>

      {event ? (
        <Text style={[t.tiny, { marginTop: 12, textAlign: "center" }]}>
          {event.name} · {event.location.venueName}
        </Text>
      ) : null}
    </Screen>
  );
}
