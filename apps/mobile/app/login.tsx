import { router } from "expo-router";
import { memo, useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { loginSchema, validate } from "@crowdshield/validation";
import { ApiError } from "@crowdshield/api-client";
import { getApiBaseUrl } from "../src/api";
import { useApp } from "../src/state/AppProvider";
import { COLORS, s, t } from "../src/theme";
import { Button, Screen } from "../src/ui";

/**
 * A labelled text field.
 *
 * Defined at MODULE scope, and this is not a style preference. It was previously
 * declared inside the screen, which meant every keystroke produced a new function
 * identity; React compares component types by reference, so it unmounted the
 * TextInput and mounted a fresh one on each render. The visible symptom was the
 * keyboard closing after a single character. A component defined inside another
 * component can never keep focus, or state, across a render.
 */
const Field = memo(function Field({
  label,
  value,
  onChangeText,
  error,
  secure,
  keyboardType,
  autoComplete,
  onSubmitEditing,
  returnKeyType,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly error?: string;
  readonly secure?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoComplete?: "username" | "password" | "email" | "tel" | "off";
  readonly onSubmitEditing?: () => void;
  readonly returnKeyType?: "next" | "go";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={t.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        // Stops the OS from "helpfully" capitalising or correcting an identifier.
        spellCheck={false}
        keyboardType={keyboardType ?? "default"}
        autoComplete={autoComplete}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        // Submitting from the keyboard should not dismiss it mid-flight.
        blurOnSubmit={false}
        placeholderTextColor={COLORS.textFaint}
        style={[s.input, error ? { borderColor: "rgba(239,68,68,0.5)" } : null]}
      />
      {error ? <Text style={[t.tiny, { color: "#fca5a5" }]}>{error}</Text> : null}
    </View>
  );
});

/**
 * Sign in against the same `/auth/login` the web console uses.
 *
 * The field is `identifier`, not `email` — it accepts a mobile number or an email
 * address. Validation runs locally first so a phone on a slow connection is not
 * spending a round trip to learn a number was nine digits.
 */
export default function LoginScreen() {
  const { signIn, t: tr } = useApp();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  // Stable callbacks, so the memoised fields do not re-render on every keystroke
  // of the *other* field.
  const changeIdentifier = useCallback((next: string) => {
    setIdentifier(next);
    setErrors((current) => (current.identifier || current._ ? {} : current));
  }, []);

  const changePassword = useCallback((next: string) => {
    setPassword(next);
    setErrors((current) => (current.password || current._ ? {} : current));
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;
    const result = validate(loginSchema, { identifier, password, rememberMe: true });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setOffline(false);
    setBusy(true);
    try {
      await signIn(result.data.identifier, result.data.password);
      router.replace("/");
    } catch (error) {
      if (error instanceof ApiError && error.offline) {
        // A transport failure is not a wrong password, and telling someone to
        // check their credentials when the request never left the phone wastes
        // their time. Show which address failed so it is diagnosable.
        setOffline(true);
        setErrors({});
      } else if (error instanceof ApiError && Object.keys(error.fields).length) {
        setErrors(error.fields);
      } else {
        setErrors({
          _:
            error instanceof ApiError
              ? error.message
              : "Couldn't sign in. Please try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, identifier, password, signIn]);

  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <>
            <Button label={busy ? tr("signingIn") : tr("signIn")} onPress={submit} loading={busy} />
            <Text style={[t.tiny, { textAlign: "center" }]}>{tr("privacyFooter")}</Text>
          </>
        }
      >
        <View style={{ height: 16 }} />
        <Text style={{ fontSize: 34 }}>🛡</Text>
        <Text style={[t.h1, { marginTop: 10 }]}>{tr("welcomeBack")}</Text>
        <Text style={t.small}>{tr("signInSubtitle")}</Text>

        <View style={{ gap: 10, marginTop: 18 }}>
          <Field
            label={tr("identifierLabel")}
            value={identifier}
            onChangeText={changeIdentifier}
            error={errors.identifier}
            keyboardType="email-address"
            autoComplete="username"
            returnKeyType="next"
          />
          <Field
            label={tr("passwordLabel")}
            value={password}
            onChangeText={changePassword}
            error={errors.password}
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            secure
          />
        </View>

        {/* Transport failure: say what could not be reached, not "wrong password". */}
        {offline ? (
          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: "rgba(245,158,11,0.32)",
              backgroundColor: "rgba(245,158,11,0.12)",
              borderRadius: 14,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={[t.h3, { color: "#fde68a" }]}>Can't reach the server</Text>
            <Text style={[t.small, { lineHeight: 18 }]}>
              The request never left your phone. This usually means Wi-Fi is off, or
              you're on mobile data and the server is on a local network.
            </Text>
            <Text style={[t.tiny, { fontFamily: "monospace" }]}>{getApiBaseUrl()}</Text>
            <Pressable onPress={() => router.push("/server")}>
              <Text style={{ color: COLORS.cyanLight, fontWeight: "700", fontSize: 12 }}>
                Change server address →
              </Text>
            </Pressable>
          </View>
        ) : null}

        {errors._ ? (
          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: "rgba(239,68,68,0.3)",
              backgroundColor: "rgba(239,68,68,0.1)",
              borderRadius: 14,
              padding: 11,
            }}
          >
            <Text style={[t.body, { color: "#fecaca" }]}>{errors._}</Text>
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/signup")} style={{ marginTop: 16 }}>
          <Text style={[t.small, { textAlign: "center" }]}>
            {tr("newHere")}{" "}
            <Text style={{ color: COLORS.cyanLight, fontWeight: "700" }}>{tr("createAccount")}</Text>
          </Text>
        </Pressable>

        <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "center", gap: 18 }}>
          <Pressable onPress={() => router.push("/language")}>
            <Text style={t.small}>🌐 {tr("language")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/server")}>
            <Text style={t.small}>⚙ Server</Text>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
