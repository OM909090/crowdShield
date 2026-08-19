import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { JOINABLE_STATUSES, RISK_META, type EventStatus } from "@crowdshield/config";
import type { Event } from "@crowdshield/types";
import { fromGeoJson } from "@crowdshield/types";
import { api } from "../src/api";
import { useApp } from "../src/state/AppProvider";
import { COLORS, s, t } from "../src/theme";
import { Badge, Card, Screen, Spinner } from "../src/ui";

/** Straight-line distance in km, for "1.2 km away". */
function kmBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function EventsScreen() {
  const { t: tr, selectEvent, fix } = useApp();
  const [events, setEvents] = useState<readonly Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishedCount, setFinishedCount] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { events: list } = await api.events.list();
      // `liveStatus` is derived from the clock; the stored `status` can be stale.
      const joinable = list.filter((event) =>
        JOINABLE_STATUSES.includes((event.liveStatus ?? event.status) as EventStatus)
      );
      setEvents(joinable);
      // Distinguish "nothing exists" from "everything already finished". Saying
      // "check back soon" when the only events ended days ago reads as a broken
      // app rather than an empty calendar.
      setFinishedCount(list.length - joinable.length);
    } catch {
      setError("Couldn't load events. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const join = (event: Event) => {
    selectEvent(event);
    router.replace("/consent");
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <Spinner label={tr("loadingEvents")} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: 4, paddingBottom: 12 }}>
        <Text style={t.h1}>{tr("pickTitle")}</Text>
        <Text style={[t.small, { marginTop: 4 }]}>{tr("pickSubtitle")}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.cyanLight} />
        }
      >
        {error ? (
          <Card>
            <Text style={t.body}>{error}</Text>
            <Pressable onPress={load}>
              <Text style={{ color: COLORS.cyanLight, fontWeight: "700", fontSize: 13 }}>
                {tr("retry")}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {!error && events.length === 0 ? (
          <Card>
            <Text style={t.body}>{tr("noEvents")}</Text>
            {finishedCount > 0 ? (
              <Text style={[t.tiny, { marginTop: 6, lineHeight: 16 }]}>
                {finishedCount === 1
                  ? "1 event exists but has already finished, so it isn't listed."
                  : `${finishedCount} events exist but have already finished, so they aren't listed.`}
              </Text>
            ) : null}
            <Pressable onPress={load} style={{ marginTop: 8 }}>
              <Text style={{ color: COLORS.cyanLight, fontWeight: "700", fontSize: 13 }}>
                {tr("retry")}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {events.map((event) => {
          const status = (event.liveStatus ?? event.status) as EventStatus;
          const live = status === "ongoing";
          const at = fromGeoJson(event.location.coordinates ?? null);
          const distance =
            fix && at ? kmBetween([fix.lat, fix.lng], at) : null;

          return (
            <Pressable key={event._id} onPress={() => join(event)}>
              <Card tone={live ? RISK_META.NORMAL.color : undefined}>
                <View style={s.between}>
                  <Badge tone={live ? RISK_META.NORMAL.color : COLORS.textMuted}>
                    {live ? tr("ongoing") : tr("upcoming")}
                  </Badge>
                  {distance != null ? (
                    <Text style={t.tiny}>
                      {distance < 1
                        ? `${Math.round(distance * 1000)} m ${tr("awayUnit")}`
                        : `${distance.toFixed(1)} km ${tr("awayUnit")}`}
                    </Text>
                  ) : null}
                </View>
                <Text style={[t.h2, { marginTop: 6 }]}>{event.name}</Text>
                <Text style={t.small}>{event.location.venueName}</Text>
                {!live ? (
                  <Text style={t.tiny}>
                    {new Date(event.startDate).toLocaleString()}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
