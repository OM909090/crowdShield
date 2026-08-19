import { router } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { ApiError } from "@crowdshield/api-client";
import { toAccountLanguage } from "@crowdshield/config";
import { signupSchema, validate } from "@crowdshield/validation";
import { api, getApiBaseUrl } from "../src/api";
import { useApp } from "../src/state/AppProvider";
import { COLORS, RADIUS, s, t, tint } from "../src/theme";
import { Banner, Button, Label, Screen } from "../src/ui";

/**
 * Create a citizen account.
 *
 * Only citizens. An authority account needs an organisation ID and a human
 * admin's approval before it can do anything — that is a desk process, not
 * something to complete on a phone in a crowd, so the app does not pretend to
 * offer it.
 *
 * Every field here is required by the existing `/auth/signup` validator. They are
 * asked for once, at signup, and never attached to a position report: the sensor
 * stream carries an anonymous device hash, which is what makes the privacy promise
 * on the consent screen true rather than a slogan.
 */

/** Module scope — a component defined inside a screen loses focus every keystroke. */
const Field = memo(function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  secure,
  keyboardType,
  maxLength,
  autoComplete,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  readonly error?: string;
  readonly hint?: string;
  readonly secure?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly maxLength?: number;
  readonly autoComplete?: "name" | "tel" | "email" | "password-new" | "off";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        autoCapitalize={autoComplete === "name" ? "words" : "none"}
        autoCorrect={false}
        spellCheck={false}
        keyboardType={keyboardType ?? "default"}
        maxLength={maxLength}
        autoComplete={autoComplete}
        blurOnSubmit={false}
        placeholderTextColor={COLORS.textFaint}
        style={[s.input, error ? { borderColor: "rgba(239,68,68,0.5)" } : null]}
      />
      {error ? (
        <Text style={[t.tiny, { color: "#fca5a5" }]}>{error}</Text>
      ) : hint ? (
        <Text style={t.tiny}>{hint}</Text>
      ) : null}
    </View>
  );
});

const GENDERS = ["Male", "Female", "Other"] as const;

export default function SignupScreen() {
  const { t: tr, lang, signIn } = useApp();

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    age: "",
    gender: "Other" as (typeof GENDERS)[number],
    emergencyContact: "",
    password: "",
    organizationId: "",
  });
  // Matches the website's signup, which offers both roles rather than assuming.
  const [role, setRole] = useState<"citizen" | "authority">("citizen");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; role: string } | null>(null);

  /**
   * One setter factory, memoised per field, so typing in one input does not
   * re-render the other six.
   */
  const setters = useMemo(() => {
    const make = (key: keyof typeof form) => (next: string) => {
      setForm((current) => ({ ...current, [key]: next }));
      setErrors((current) => {
        if (!current[key] && !current._) return current;
        const { [key]: _removed, _: _form, ...rest } = current;
        return rest;
      });
    };
    return {
      name: make("name"),
      mobile: make("mobile"),
      email: make("email"),
      age: make("age"),
      emergencyContact: make("emergencyContact"),
      password: make("password"),
      organizationId: make("organizationId"),
    };
  }, []);

  const submit = useCallback(async () => {
    if (busy) return;

    const candidate = {
      ...form,
      age: form.age,
      // The account's language follows the one they already chose on first run,
      // so they are not asked the same question twice in different words.
      language: toAccountLanguage(lang),
      role,
      // Only sent for an authority account; the schema requires it in that case.
      organizationId: role === "authority" ? form.organizationId : undefined,
    };

    const result = validate(signupSchema, candidate);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const { user } = await api.auth.signup(result.data);
      // Say so. Previously this navigated straight to the event picker, and when
      // that picker was empty it looked as though nothing had happened at all.
      setCreated({ name: user.name, role: user.role });
      // Signing up already returns a session, but going through signIn keeps one
      // path for "how does this app end up authenticated".
      await signIn(result.data.email, result.data.password);
    } catch (error) {
      if (error instanceof ApiError && error.offline) {
        setErrors({
          _: `Can't reach the server at ${getApiBaseUrl()}. Check Wi-Fi, or change the address in Server settings.`,
        });
      } else if (error instanceof ApiError && Object.keys(error.fields).length) {
        setErrors(error.fields);
      } else {
        setErrors({
          _: error instanceof ApiError ? error.message : "Couldn't create the account. Please try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, form, lang, signIn]);

  /**
   * Confirmation. The website shows a toast and moves on; a phone has no toast in
   * the same place, and moving straight to an empty event picker read as "nothing
   * happened" — which is precisely how this failed the first time.
   */
  if (created) {
    return (
      <Screen
        footer={
          <Button
            label={created.role === "authority" ? "Continue" : "Choose your event"}
            onPress={() => router.replace("/")}
          />
        }
      >
        <View style={{ height: 60 }} />
        <View style={[s.center, { gap: 14 }]}>
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: tint(COLORS.success, 0.4),
              backgroundColor: tint(COLORS.success, 0.14),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 36 }}>✓</Text>
          </View>
          <Text style={[t.h1, { textAlign: "center" }]}>Account created</Text>
          <Text style={[t.body, { textAlign: "center" }]}>
            Welcome, {created.name}. You're signed in.
          </Text>
        </View>

        <View style={{ marginTop: 22 }}>
          {created.role === "authority" ? (
            <Banner tone={COLORS.warning}>
              <Text style={[t.h3, { color: "#fde68a" }]}>Waiting for verification</Text>
              <Text style={[t.small, { lineHeight: 18 }]}>
                An admin has to approve this authority account before it can publish
                events or open the command centre. Until then you can use the app as
                an attendee.
              </Text>
            </Banner>
          ) : (
            <Banner tone={COLORS.cyanLight}>
              <Text style={[t.h3, { color: "#a5f3fc" }]}>Next: pick your event</Text>
              <Text style={[t.small, { lineHeight: 18 }]}>
                Choose where you are, then decide whether to share your location. Only
                events happening now or soon are listed.
              </Text>
            </Banner>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        footer={
          <>
            <Button
              label={busy ? "Creating account…" : "Create account"}
              onPress={submit}
              loading={busy}
            />
            <Pressable onPress={() => router.replace("/login")}>
              <Text style={[t.small, { textAlign: "center" }]}>
                Already have an account? <Text style={{ color: COLORS.cyanLight, fontWeight: "700" }}>Sign in</Text>
              </Text>
            </Pressable>
          </>
        }
      >
        <View style={{ height: 12 }} />
        <Text style={t.h1}>Create your account</Text>
        <Text style={[t.small, { marginTop: 4 }]}>
          So we can reach you in an emergency. Your details are never attached to
          your location.
        </Text>

        {/* Role, as the website offers it. An authority account is created here but
            cannot publish anything until an admin verifies it — said plainly rather
            than discovered later. */}
        <View style={{ gap: 6, marginTop: 16 }}>
          <Label>I am a</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["citizen", "authority"] as const).map((option) => {
              const active = role === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setRole(option)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderColor: active ? tint(COLORS.cyanLight, 0.4) : COLORS.line,
                    backgroundColor: active ? tint(COLORS.cyanLight, 0.1) : COLORS.glass,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: active ? COLORS.cyanLight : "#cbd5e1",
                    }}
                  >
                    {option === "citizen" ? "Attendee" : "Authority"}
                  </Text>
                  <Text style={[t.tiny, { marginTop: 2 }]}>
                    {option === "citizen" ? "At the event" : "Running the event"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {role === "authority" ? (
            <Text style={[t.tiny, { color: "#fde68a", lineHeight: 15 }]}>
              An admin must verify an authority account before it can publish events
              or see the command centre.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 12, marginTop: 16 }}>
          <Field
            label="Full name"
            value={form.name}
            onChangeText={setters.name}
            error={errors.name}
            autoComplete="name"
            maxLength={100}
          />
          <Field
            label="Mobile number"
            value={form.mobile}
            onChangeText={setters.mobile}
            error={errors.mobile}
            hint="10 digits"
            keyboardType="number-pad"
            maxLength={10}
            autoComplete="tel"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={setters.email}
            error={errors.email}
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Age"
            value={form.age}
            onChangeText={setters.age}
            error={errors.age}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={{ gap: 6 }}>
            <Label>Gender</Label>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {GENDERS.map((option) => {
                const active = form.gender === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setForm((current) => ({ ...current, gender: option }))}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderRadius: RADIUS.md,
                      paddingVertical: 11,
                      alignItems: "center",
                      borderColor: active ? tint(COLORS.cyanLight, 0.4) : COLORS.line,
                      backgroundColor: active ? tint(COLORS.cyanLight, 0.1) : COLORS.glass,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: active ? COLORS.cyanLight : "#cbd5e1",
                      }}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.gender ? (
              <Text style={[t.tiny, { color: "#fca5a5" }]}>{errors.gender}</Text>
            ) : null}
          </View>

          <Field
            label="Emergency contact"
            value={form.emergencyContact}
            onChangeText={setters.emergencyContact}
            error={errors.emergencyContact}
            hint="10 digits — who we call if something happens to you"
            keyboardType="number-pad"
            maxLength={10}
          />
          <Field
            label="Password"
            value={form.password}
            onChangeText={setters.password}
            error={errors.password}
            hint="At least 6 characters"
            autoComplete="password-new"
            secure
          />

          {role === "authority" ? (
            <Field
              label="Organization / Badge ID"
              value={form.organizationId}
              onChangeText={setters.organizationId}
              error={errors.organizationId}
              hint="Required for an authority account"
            />
          ) : null}
        </View>

        {errors._ ? (
          <View
            style={{
              marginTop: 14,
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

        <Text style={[t.tiny, { marginTop: 14, lineHeight: 16 }]}>
          {tr("privacyFooter")} Location sharing is asked for separately, after you
          pick an event, and can be turned off at any time.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
