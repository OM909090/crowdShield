import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NO_DATA_META, RISK_META, severityMeta } from "@crowdshield/config";
import { useApp } from "../../src/state/AppProvider";
import { useFeed } from "../../src/state/FeedProvider";
import { formatEta, formatPeople, readSituation, formatAgo } from "../../src/situation";
import { COLORS, RADIUS, s, t, tint } from "../../src/theme";
import { Badge, Banner, Button, Card, Label, Pill, Screen } from "../../src/ui";

/**
 * Home — "am I safe, and what do I do".
 *
 * Three states, and the third is the point: when nothing is reporting the
 * headline is a grey "Crowd level unknown", never a green all-clear. Absent data
 * has to look absent.
 */
export default function HomeScreen() {
  const { t: tr, event, sharing, locating, fix, lang } = useApp();
  const { frame, alerts, broadcasts, status, updatedAt, yourZone } = useFeed();
  const [acked, setAcked] = useState<readonly string[]>([]);

  const situation = useMemo(
    () => readSituation(frame, { fix, yourZone }),
    [frame, fix, yourZone]
  );

  // Re-render the "updated Xs ago" label on a cadence so it keeps counting up
  // when the feed goes quiet — a frozen "just now" would hide a stalled feed.
  const [, force] = useState(0);
  useEffect(() => {
    if (updatedAt == null) return undefined;
    const timer = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [updatedAt]);

  // Newest unacknowledged announcement gets the banner; the rest stay in the list.
  const notice = useMemo(
    () => broadcasts.find((b) => !acked.includes(b.id)) ?? null,
    [broadcasts, acked]
  );

  const offline = status === "offline";
  const headline =
    situation.kind === "unmeasured"
      ? tr("levelUnknown")
      : situation.kind === "elevated"
        ? tr("crowdingNearby")
        : tr("allClear");

  return (
    <Screen scroll={false}>
      {offline ? (
        <View
          style={{
            marginHorizontal: -16,
            paddingHorizontal: 16,
            paddingVertical: 7,
            backgroundColor: tint(COLORS.warning, 0.14),
            borderBottomWidth: 1,
            borderBottomColor: tint(COLORS.warning, 0.28),
          }}
        >
          <Text style={{ color: "#fde68a", fontSize: 11, fontWeight: "600" }}>
            ⚠ {tr("offlineBanner")}
          </Text>
        </View>
      ) : null}

      {/* Header */}
      <View style={[s.between, { paddingTop: 8, paddingBottom: 10 }]}>
        <View style={s.grow}>
          <Text style={t.h3} numberOfLines={1}>
            {event?.name ?? tr("appName")}
          </Text>
          <Text style={t.tiny} numberOfLines={1}>
            {event?.location.venueName ?? ""}
          </Text>
        </View>
        <Pill tone={offline ? COLORS.danger : sharing ? RISK_META.NORMAL.color : undefined}>
          {offline
            ? tr("noSignal")
            : locating
              ? tr("locating")
              : sharing
                ? tr("live")
                : tr("browseOnly")}
        </Pill>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 11, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* No pull-to-refresh here on purpose. The feed is a live socket pushing a
            frame every second, so there is nothing for a pull to fetch — offering
            the gesture would imply the data is stale when it is not. */}
        {/* Announcement from the control room — top slot, must be acknowledged. */}
        {notice ? (
          <Banner tone={notice.severity === "critical" ? COLORS.danger : COLORS.warning}>
            <View style={s.between}>
              <Badge tone={notice.severity === "critical" ? COLORS.danger : COLORS.warning}>
                {notice.source === "agent" ? tr("aiAdvisory") : tr("eventControl")}
              </Badge>
              <Text style={t.tiny}>{new Date(notice.createdAt).toLocaleTimeString()}</Text>
            </View>
            <Text style={[t.body, { color: "#fff" }]}>
              {notice.messages?.[lang] ?? notice.message}
            </Text>
            <Pressable
              onPress={() => setAcked((prev) => [...prev, notice.id])}
              style={[s.pill, { alignSelf: "flex-start" }]}
            >
              <Text style={{ color: "#e2e8f0", fontSize: 11, fontWeight: "700" }}>
                {tr("gotIt")}
              </Text>
            </Pressable>
          </Banner>
        ) : null}

        {/* The headline state. */}
        <Card tone={situation.kind === "unmeasured" ? undefined : situation.color}>
          <View style={s.between}>
            <Label>{tr("situation")}</Label>
            <Badge tone={situation.color}>{situation.levelLabel}</Badge>
          </View>

          <Text style={[t.display, { color: situation.color, marginTop: 6 }]}>{headline}</Text>

          <Text style={t.small}>
            {situation.kind === "unmeasured"
              ? tr("unknownBody")
              : situation.zone
                ? `${situation.zone.name} · ${
                    situation.kind === "elevated" ? tr("aheadOfYou") : tr("movingFreely")
                  }`
                : ""}
          </Text>

          {situation.kind === "unmeasured" ? (
            <View style={{ marginTop: 8 }}>
              <Banner tone={NO_DATA_META.color}>
                <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("unknownNote")}</Text>
              </Banner>
            </View>
          ) : (
            <View style={[s.between, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.line }]}>
              <View>
                <Label>{tr("estCrowd")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>{formatPeople(situation.personsEst)}</Text>
              </View>
              <View>
                <Label>{tr("yourZone")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>
                  {situation.yourDensity != null ? `${situation.yourDensity} p/m²` : "—"}
                </Text>
              </View>
              <View>
                <Label>{tr("updated")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>
                  {status === "offline" ? tr("noSignal") : (formatAgo(updatedAt) ?? tr("justNow"))}
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Two actions that matter. */}
        <View style={{ flexDirection: "row", gap: 9 }}>
          <Pressable style={s.grow} onPress={() => router.push("/(tabs)/go")}>
            <Card style={[s.cardTight, { gap: 5 }]}>
              <Ionicons name="navigate" size={17} color={COLORS.cyanLight} />
              <Text style={t.h3}>{tr("exitBtn")}</Text>
              <Text style={t.tiny}>{tr("exitBody")}</Text>
            </Card>
          </Pressable>
          <Pressable style={s.grow} onPress={() => router.push("/(tabs)/map")}>
            <Card style={[s.cardTight, { gap: 5 }]}>
              <Ionicons name="map" size={17} color={COLORS.cyanLight} />
              <Text style={t.h3}>{tr("mapTitle")}</Text>
              <Text style={t.tiny}>{tr("youAreHere")}</Text>
            </Card>
          </Pressable>
        </View>

        {/* Live alerts. */}
        <View style={{ gap: 7 }}>
          <Label>{tr("liveAlerts")}</Label>
          {alerts.length === 0 ? (
            <Card style={[s.cardTight, { alignItems: "center", paddingVertical: 16 }]}>
              <Text style={{ fontSize: 18 }}>✓</Text>
              <Text style={t.small}>{tr("noAlerts")}</Text>
              <Text style={[t.tiny, { textAlign: "center" }]}>{tr("noAlertsNote")}</Text>
            </Card>
          ) : (
            alerts.slice(0, 4).map((alert) => {
              const tone = severityMeta(alert.severity).color;
              const eta = formatEta(alert.etaCriticalSec);
              return (
                <Card key={alert.id} style={s.cardTight} tone={tone}>
                  <View style={s.row}>
                    <View style={{ width: 3, alignSelf: "stretch", borderRadius: 9, backgroundColor: tone }} />
                    <View style={s.grow}>
                      <View style={s.between}>
                        <Text style={t.h3} numberOfLines={1}>
                          {alert.zoneName}
                        </Text>
                        <Badge tone={tone}>{severityMeta(alert.severity).label}</Badge>
                      </View>
                      {eta ? (
                        <Text style={[t.small, { marginTop: 3 }]}>
                          {tr("criticalIn")} ~{eta}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* SOS is never more than one tap away, from any tab. */}
        <Button
          label={tr("sos")}
          variant="danger"
          onPress={() => router.push("/sos")}
          style={{ marginTop: 2, borderRadius: RADIUS.md }}
        />
        {/* Structured reporting was fully built and wired but had no way in — a
            barricade come loose or a blocked lane is something no sensor sees,
            so the control room depends on this being reachable. */}
        <Button
          label={tr("reportTitle")}
          variant="ghost"
          onPress={() => router.push("/report")}
          style={{ borderRadius: RADIUS.md }}
        />
        <Text style={[t.tiny, { textAlign: "center" }]}>{tr("footerNote")}</Text>
      </ScrollView>
    </Screen>
  );
}
