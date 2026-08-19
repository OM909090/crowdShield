import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import {
  DEFAULT_API_BASE_URL,
  clearApiBaseUrl,
  getApiBaseUrl,
  normaliseBaseUrl,
  probeApi,
  setApiBaseUrl,
} from "../src/api";
import { COLORS, s, t } from "../src/theme";
import { Banner, Button, Card, Label, Screen } from "../src/ui";

/**
 * Point the app at a different backend.
 *
 * This exists because a build-time address is a liability in the field. The APK
 * has one baked in; when it is wrong — a laptop's LAN IP changed, the phone is on
 * cellular, the server moved — the only other remedy is rebuilding and
 * reinstalling 54 MB. Being able to retype the address and test it turns a dead
 * install into a ten-second fix, and it makes "no internet connection" a
 * diagnosable statement rather than a dead end.
 */
export default function ServerScreen() {
  const [value, setValue] = useState(getApiBaseUrl());
  const [probing, setProbing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(getApiBaseUrl());
  }, []);

  const test = useCallback(async () => {
    setProbing(true);
    setResult(null);
    setResult(await probeApi(value));
    setProbing(false);
  }, [value]);

  const save = useCallback(async () => {
    const applied = await setApiBaseUrl(value);
    setValue(applied);
    setSaved(true);
    // Confirm it works rather than just claiming it was saved.
    setProbing(true);
    setResult(await probeApi(applied));
    setProbing(false);
  }, [value]);

  const reset = useCallback(async () => {
    const applied = await clearApiBaseUrl();
    setValue(applied);
    setResult(null);
    setSaved(false);
  }, []);

  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <>
            <Button label={probing ? "Testing…" : "Test connection"} variant="ghost" onPress={test} loading={probing} />
            <Button label="Save & use this address" onPress={save} />
            <Button label="Done" variant="ghost" onPress={() => router.back()} />
          </>
        }
      >
        <View style={{ height: 10 }} />
        <Text style={t.h1}>Server address</Text>
        <Text style={[t.small, { marginTop: 4 }]}>
          Where this app looks for the CrowdShield API.
        </Text>

        <View style={{ gap: 6, marginTop: 16 }}>
          <Label>API address</Label>
          <TextInput
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="url"
            placeholder="192.168.1.20:5000"
            placeholderTextColor={COLORS.textFaint}
            style={[s.input, { fontFamily: "monospace", fontSize: 12 }]}
          />
          <Text style={t.tiny}>
            Host and port is enough — “192.168.1.20:5000” becomes “
            {normaliseBaseUrl("192.168.1.20:5000")}”.
          </Text>
        </View>

        {result ? (
          <View style={{ marginTop: 14 }}>
            <Banner tone={result.ok ? COLORS.success : COLORS.warning}>
              <Text style={[t.h3, { color: result.ok ? "#bbf7d0" : "#fde68a" }]}>
                {result.ok ? "Connected" : "Couldn't connect"}
              </Text>
              <Text style={[t.small, { lineHeight: 18 }]}>{result.detail}</Text>
            </Banner>
          </View>
        ) : null}

        {saved && result?.ok ? (
          <Text style={[t.small, { marginTop: 10, color: "#bbf7d0" }]}>
            Saved. Go back and sign in.
          </Text>
        ) : null}

        <View style={{ marginTop: 18, gap: 8 }}>
          <Label>If it can't connect</Label>
          <Card style={s.cardTight}>
            <Text style={[t.small, { lineHeight: 19 }]}>
              1. Turn on Wi-Fi and join the same network as the server. A local
              address like 192.168.x.x is not reachable over mobile data.
            </Text>
            <Text style={[t.small, { lineHeight: 19 }]}>
              2. Check the server is running and listening on all interfaces, not
              only localhost.
            </Text>
            <Text style={[t.small, { lineHeight: 19 }]}>
              3. Confirm the address and port match the machine running the API.
            </Text>
          </Card>
        </View>

        <View style={{ marginTop: 16, gap: 4 }}>
          <Label>Built-in default</Label>
          <Text style={[t.tiny, { fontFamily: "monospace" }]}>{DEFAULT_API_BASE_URL}</Text>
          <Text style={[t.tiny, { color: COLORS.cyanLight }]} onPress={reset}>
            Reset to this
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
