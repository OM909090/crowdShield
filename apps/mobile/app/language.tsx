import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { LANGUAGE_META, type LanguageCode } from "@crowdshield/config";
import { useApp } from "../src/state/AppProvider";
import { COLORS, RADIUS, s, t, tint } from "../src/theme";
import { Button, Screen } from "../src/ui";

/**
 * First-run language choice.
 *
 * Each option is written in its own script and never translated into English:
 * someone who reads only Odia needs to recognise ଓଡ଼ିଆ, not find "Odia".
 */
export default function LanguageScreen() {
  const { lang, setLang, t: tr } = useApp();

  const choose = (code: LanguageCode) => setLang(code);

  return (
    <Screen
      footer={
        <Button
          label={tr("continue")}
          onPress={() => router.replace("/")}
        />
      }
    >
      <View style={{ height: 12 }} />
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: tint(COLORS.cyanLight, 0.3),
          backgroundColor: tint(COLORS.cyanLight, 0.1),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 25 }}>🌐</Text>
      </View>

      <Text style={[t.h1, { marginTop: 14 }]}>{tr("chooseLanguage")}</Text>
      <Text style={t.small}>अपनी भाषा चुनें · ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ</Text>

      <View style={{ gap: 8, marginTop: 14 }}>
        {LANGUAGE_META.map((meta) => {
          const active = meta.code === lang;
          return (
            <Pressable
              key={meta.code}
              onPress={() => choose(meta.code)}
              style={[
                s.card,
                s.cardTight,
                { flexDirection: "row", alignItems: "center", gap: 10 },
                active && {
                  borderColor: tint(COLORS.cyanLight, 0.4),
                  backgroundColor: tint(COLORS.cyanLight, 0.1),
                },
              ]}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: tint(COLORS.cyanLight, 0.2),
                  backgroundColor: tint(COLORS.cyanLight, 0.08),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: COLORS.cyanLight, fontWeight: "700", fontSize: 12 }}>
                  {meta.short}
                </Text>
              </View>
              <View style={s.grow}>
                <Text style={t.h3}>{meta.native}</Text>
                <Text style={t.tiny}>{meta.english}</Text>
              </View>
              {active ? (
                <Text style={{ color: COLORS.cyanLight, fontSize: 15, fontWeight: "700" }}>✓</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[t.tiny, { marginTop: 12, lineHeight: 16 }]}>{tr("languageNote")}</Text>
      <View style={{ height: RADIUS.md }} />
    </Screen>
  );
}
