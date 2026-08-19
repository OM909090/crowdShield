import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { COLORS } from "@crowdshield/config";
import { api } from "../src/api";
import { useApp } from "../src/state/AppProvider";
import { RADIUS, s, t, tint } from "../src/theme";
import { Banner, Button, Card, Label, Screen } from "../src/ui";

/** How long the button must be held. Long enough to be deliberate. */
const HOLD_MS = 3000;

/**
 * SOS, behind a deliberate hold.
 *
 * Two taps and a three-second hold, because a pocket-dialled SOS in a crowd of
 * twenty thousand costs a marshal a real trip. The wording is careful too: event
 * control is notified, and nobody is promised to be running — the app cannot know
 * that, and telling a frightened person help is on the way when it may not be is
 * worse than telling them the truth and to shout for a marshal.
 */
export default function SosScreen() {
  const { t: tr, event, fix } = useApp();
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const fire = async () => {
    if (!event?._id || sending) return;
    setSending(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await api.citizen.report(event._id, { category: "sos", lat: fix?.lat, lng: fix?.lng });
      setSent(true);
    } catch {
      // Reset the fill so the button reads "Hold · 3s" again — it IS the retry.
      setError(tr("sosFail"));
      setProgress(0);
    } finally {
      setSending(false);
    }
  };

  const start = () => {
    // Guard against a second hold while the first SOS is still in flight — a
    // duplicate emergency report costs a marshal a second wasted trip.
    if (sent || sending) return;
    setHolding(true);
    setError(null);
    const started = Date.now();
    timerRef.current = setInterval(() => {
      const fraction = Math.min(1, (Date.now() - started) / HOLD_MS);
      setProgress(fraction);
      if (fraction >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        setHolding(false);
        void fire();
      }
    }, 50);
  };

  const cancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setHolding(false);
    setProgress(0);
  };

  if (sent) {
    return (
      <Screen
        footer={<Button label={tr("gotIt")} onPress={() => router.back()} />}
      >
        <View style={{ height: 30 }} />
        <View style={[s.center, { gap: 12 }]}>
          <Text style={{ fontSize: 44 }}>🆘</Text>
          <Text style={[t.h1, { textAlign: "center" }]}>{tr("sosSent")}</Text>
        </View>
        <View style={{ marginTop: 16 }}>
          <Banner tone={COLORS.warning}>
            <Text style={[t.body, { lineHeight: 19 }]}>{tr("sosAlsoShout")}</Text>
          </Banner>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Pressable
            onPressIn={sending ? undefined : start}
            onPressOut={sending ? undefined : cancel}
            disabled={sending}
            style={{
              height: 56,
              borderRadius: RADIUS.md,
              overflow: "hidden",
              backgroundColor: "#dc2626",
              justifyContent: "center",
              opacity: sending ? 0.85 : 1,
            }}
          >
            {/* Fill grows as the hold progresses — visible commitment. */}
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(sending ? 1 : progress) * 100}%`,
                backgroundColor: "#7f1d1d",
              }}
            />
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" }}>
              {sending
                ? tr("sosSending")
                : holding
                  ? `${tr("sosHold")} · ${Math.ceil((1 - progress) * 3)}s`
                  : `${tr("sosHold")} · 3s`}
            </Text>
          </Pressable>
          <Button label={tr("cancel")} variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <View style={{ height: 18 }} />
      <View style={[s.center, { gap: 10 }]}>
        <View
          style={{
            width: 74,
            height: 74,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: tint(COLORS.danger, 0.4),
            backgroundColor: tint(COLORS.danger, 0.14),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 34 }}>🆘</Text>
        </View>
        <Text style={[t.h1, { textAlign: "center" }]}>{tr("sosConfirmTitle")}</Text>
        <Text style={[t.body, { textAlign: "center" }]}>{tr("sosConfirmBody")}</Text>
      </View>

      <Card style={[s.cardTight, { marginTop: 16 }]}>
        <Label>{tr("sosWhatSent")}</Label>
        <View style={{ gap: 6, marginTop: 6 }}>
          <View style={s.row}>
            <Text>📍</Text>
            <Text style={[t.small, s.grow]}>
              {fix ? tr("sosItem1") : tr("exitNeedGps")}
            </Text>
          </View>
          <View style={s.row}>
            <Text>🕐</Text>
            <Text style={[t.small, s.grow]}>{tr("sosItem2")}</Text>
          </View>
          <View style={s.row}>
            <Text>🎫</Text>
            <Text style={[t.small, s.grow]}>
              {tr("sosItem3")} — {event?.name ?? "—"}
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: 12 }}>
        <Banner tone={COLORS.warning}>
          <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("sosAlsoShout")}</Text>
        </Banner>
      </View>

      {error ? (
        <Text style={[t.body, { color: "#fca5a5", marginTop: 10 }]}>{error}</Text>
      ) : null}
    </Screen>
  );
}
