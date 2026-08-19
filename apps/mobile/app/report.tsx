import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABELS, type ReportCategory } from "@crowdshield/config";
import { api } from "../src/api";
import { useApp } from "../src/state/AppProvider";
import { COLORS, RADIUS, s, t, tint } from "../src/theme";
import { Button, Card, Label, Screen } from "../src/ui";

const ICONS: Record<ReportCategory, string> = {
  medical: "🫀",
  hazard: "🔥",
  blocked: "⛔",
  lost: "🧍",
  other: "💬",
};

/**
 * Structured reporting — how the control room learns about things no phone can
 * measure: a barricade come loose, a blocked lane, someone separated from their
 * group. The five categories are the backend's enum, already translated.
 */
export default function ReportScreen() {
  const { t: tr, lang, event, fix } = useApp();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [attachLocation, setAttachLocation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!category || !event?._id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.citizen.report(event._id, {
        category,
        note: note.trim() || undefined,
        // Location is opt-out: it makes the report far more useful, but a person
        // reporting something must not be forced to reveal where they stand.
        lat: attachLocation ? fix?.lat : undefined,
        lng: attachLocation ? fix?.lng : undefined,
      });
      setSent(true);
    } catch {
      setError(tr("reportFail"));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen footer={<Button label={tr("gotIt")} onPress={() => router.back()} />}>
        <View style={{ height: 40 }} />
        <View style={[s.center, { gap: 12 }]}>
          <Text style={{ fontSize: 40 }}>✓</Text>
          <Text style={[t.h1, { textAlign: "center" }]}>{tr("reportToast")}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label={busy ? tr("submitting") : tr("submit")}
            onPress={submit}
            loading={busy}
            disabled={!category}
          />
          <Button label={tr("cancel")} variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <View style={{ height: 8 }} />
      <Text style={t.h1}>{tr("reportTitle")}</Text>
      <Text style={t.small}>{tr("reportSubtitle")}</Text>

      <View style={{ marginTop: 14, gap: 8 }}>
        <Label>{tr("reportWhat")}</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REPORT_CATEGORIES.map((value) => {
            const active = category === value;
            return (
              <Pressable
                key={value}
                onPress={() => setCategory(active ? null : value)}
                style={{
                  width: "31%",
                  borderWidth: 1,
                  borderColor: active ? tint(COLORS.cyanLight, 0.4) : COLORS.line,
                  backgroundColor: active ? tint(COLORS.cyanLight, 0.1) : COLORS.glass,
                  borderRadius: RADIUS.md,
                  paddingVertical: 12,
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Text style={{ fontSize: 19 }}>{ICONS[value]}</Text>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#cbd5e1" }}>
                  {REPORT_CATEGORY_LABELS[value][lang]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ marginTop: 14, gap: 6 }}>
        <Label>{tr("notePlaceholder")}</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder={tr("notePlaceholder")}
          placeholderTextColor={COLORS.textFaint}
          style={[s.input, { height: 84, textAlignVertical: "top" }]}
        />
      </View>

      <Pressable onPress={() => setAttachLocation((prev) => !prev)} style={{ marginTop: 12 }}>
        <Card style={s.cardTight}>
          <View style={s.between}>
            <View style={s.grow}>
              <Text style={t.h3}>{tr("attachLocation")}</Text>
              <Text style={t.tiny}>{tr("attachLocationNote")}</Text>
            </View>
            <View
              style={{
                width: 38,
                height: 22,
                borderRadius: RADIUS.pill,
                backgroundColor: attachLocation ? COLORS.cyan : "rgba(255,255,255,0.14)",
                justifyContent: "center",
                paddingHorizontal: 3,
                alignItems: attachLocation ? "flex-end" : "flex-start",
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 99,
                  backgroundColor: attachLocation ? "#02121a" : "#94a3b8",
                }}
              />
            </View>
          </View>
        </Card>
      </Pressable>

      {error ? <Text style={[t.body, { color: "#fca5a5", marginTop: 10 }]}>{error}</Text> : null}
      <Text style={[t.tiny, { marginTop: 10, lineHeight: 16 }]}>{tr("reportNote")}</Text>
    </Screen>
  );
}
