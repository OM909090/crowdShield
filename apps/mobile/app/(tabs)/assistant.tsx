import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { streamAssistant } from "@crowdshield/api-client";
import { getApiBaseUrl, session } from "../../src/api";
import { Markdown } from "../../src/Markdown";
import { useApp } from "../../src/state/AppProvider";
import { COLORS, RADIUS, s, t, tint } from "../../src/theme";
import { Centered, Pill } from "../../src/ui";

interface Message {
  readonly id: string;
  readonly role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * The AI companion, talking to the citizen persona already built and tested on
 * the backend.
 *
 * The event id, the live position and the language all go with the question —
 * that is what makes the answer specific to where this person is standing rather
 * than generic advice. Replies are rendered as Markdown, so bold street names
 * and bullet steps arrive formatted.
 */
export default function AssistantScreen() {
  const { t: tr, event, fix, lang } = useApp();
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // ScrollView is a function component in the current RN types, so the instance
  // type has to come from ComponentRef rather than the component itself.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const history = messages
        .filter((m) => m.content && !m.streaming)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const replyId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", content: text },
        { id: replyId, role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      void streamAssistant({
        // Runtime address, not the frozen build-time constant — otherwise the
        // assistant dials the wrong host on a real device / after an override.
        baseUrl: getApiBaseUrl(),
        session,
        signal: controller.signal,
        input: {
          message: text,
          eventId: event?._id,
          history,
          // Only sent when they consented to sharing; without it the assistant
          // says plainly that it does not know where they are.
          lat: fix?.lat,
          lng: fix?.lng,
          heading: fix?.heading,
          lang,
        },
        onDelta: (chunk) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m))
          ),
      })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId && !m.content
                ? { ...m, content: "Something went wrong. Please try again." }
                : m
            )
          );
        })
        .finally(() => {
          setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, streaming: false } : m)));
          setStreaming(false);
          abortRef.current = null;
        });
    },
    [messages, streaming, event?._id, fix, lang]
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const suggestions = [tr("q1"), tr("q2"), tr("q3"), tr("q4")];

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={[s.between, { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }]}>
        <View style={s.row}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: tint(COLORS.cyanLight, 0.25),
              backgroundColor: tint(COLORS.cyanLight, 0.1),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles" size={16} color={COLORS.cyanLight} />
          </View>
          <View>
            <Text style={t.h3}>{tr("assistantTitle")}</Text>
            <Text style={t.tiny}>
              {streaming ? tr("assistantThinking") : `● ${tr("assistantStatus")}`}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 9 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <Centered emoji="✦" title={tr("assistantEmpty")} body={tr("assistantBlurb")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center", marginTop: 6 }}>
                {suggestions.map((question) => (
                  <Pill key={question} onPress={() => send(question)}>
                    {question}
                  </Pill>
                ))}
              </View>
            </Centered>
          </View>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <View
                key={message.id}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "84%",
                  backgroundColor: COLORS.cyan,
                  borderRadius: 18,
                  borderBottomRightRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: "#02121a", fontSize: 13, fontWeight: "600", lineHeight: 19 }}>
                  {message.content}
                </Text>
              </View>
            ) : (
              <View
                key={message.id}
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "88%",
                  borderWidth: 1,
                  borderColor: COLORS.line,
                  backgroundColor: COLORS.glassStrong,
                  borderRadius: 18,
                  borderBottomLeftRadius: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                {message.content ? (
                  <Markdown>{message.content}</Markdown>
                ) : (
                  <ActivityIndicator size="small" color={COLORS.cyanLight} />
                )}
              </View>
            )
          )
        )}
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 14,
          borderTopWidth: 1,
          borderTopColor: COLORS.line,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={tr("assistantPlaceholder")}
          placeholderTextColor={COLORS.textFaint}
          style={[s.input, s.grow]}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          multiline
        />
        <Pressable
          onPress={streaming ? stop : () => send(input)}
          disabled={!streaming && !input.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: RADIUS.md,
            backgroundColor: streaming ? tint(COLORS.danger, 0.9) : COLORS.cyan,
            alignItems: "center",
            justifyContent: "center",
            opacity: !streaming && !input.trim() ? 0.4 : 1,
          }}
        >
          <Ionicons name={streaming ? "stop" : "send"} size={17} color="#02121a" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
