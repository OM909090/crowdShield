import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NO_DATA_META, RISK_META, densityBand, densityMeta } from "@crowdshield/config";
import type { Destination, ExitRoute, Guidance } from "@crowdshield/types";
import { api } from "../../src/api";
import { useApp } from "../../src/state/AppProvider";
import { useFeed } from "../../src/state/FeedProvider";
import { formatDistance, formatEta } from "../../src/situation";
import { COLORS, s, t } from "../../src/theme";
import { Badge, Banner, Button, Card, Label, Screen } from "../../src/ui";

/**
 * Routing. "Get me out" first, because that is the urgent case; picking a
 * destination is the calm one.
 *
 * Both call the same endpoints the web client does, so a citizen's phone and the
 * command centre can never name different gates. A closed gate is shown as closed
 * and cannot be selected — the exit router already skips them, and offering one
 * here as a destination was a real bug on the web build.
 */
export default function GoScreen() {
  const { t: tr, event, fix, sharing } = useApp();
  // Venue (with live-refreshed gate state) comes from the shared feed, so a gate
  // the control room just closed is shown closed here too.
  const { venue } = useFeed();

  const [destinations, setDestinations] = useState<readonly Destination[]>([]);
  const [exit, setExit] = useState<ExitRoute | null>(null);
  const [exitMessage, setExitMessage] = useState<string | null>(null);
  const [exitBusy, setExitBusy] = useState(false);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [guidanceBusy, setGuidanceBusy] = useState<string | null>(null);

  useEffect(() => {
    const eventId = event?._id;
    if (!eventId) return;
    let cancelled = false;
    void api.events
      .destinations(eventId)
      .then((d) => {
        if (!cancelled) setDestinations(d.destinations);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [event?._id]);

  /** Gate state lives on the venue nodes, not on the destination list. */
  const stateOf = useCallback(
    (id: string): string => venue?.nodes.find((node) => node.id === id)?.state ?? "open",
    [venue]
  );

  const findExit = async () => {
    if (!event?._id || exitBusy) return;
    if (!fix) {
      setExitMessage(tr("exitNeedGps"));
      return;
    }
    setExitBusy(true);
    setExit(null);
    setExitMessage(null);
    try {
      const { exit: found, message } = await api.citizen.exitRoute(event._id, {
        lat: fix.lat,
        lng: fix.lng,
      });
      // `exit: null` with a message is a valid answer, written to be shown as-is.
      if (found) setExit(found);
      else setExitMessage(message ?? tr("exitUnavailable"));
    } catch {
      setExitMessage(tr("exitUnavailable"));
    } finally {
      setExitBusy(false);
    }
  };

  const routeTo = async (destination: Destination) => {
    if (!event?._id || !fix) {
      setExitMessage(tr("needLocation"));
      return;
    }
    setGuidanceBusy(destination.id);
    setGuidance(null);
    try {
      const { guidance: result } = await api.citizen.guidance(event._id, {
        lat: fix.lat,
        lng: fix.lng,
        heading: fix.heading,
        destinationId: destination.id,
      });
      setGuidance(result);
    } catch {
      setGuidance(null);
    } finally {
      setGuidanceBusy(null);
    }
  };

  /** Route condition, honest about how much of it was actually measured. */
  const routeTone = (worst: number | null | undefined, fraction: number | null | undefined) => {
    if (worst == null) return { color: NO_DATA_META.color, label: NO_DATA_META.label };
    const band = densityBand(worst);
    const meta = band ? densityMeta(band) : { color: NO_DATA_META.color, label: NO_DATA_META.label };
    return { color: meta.color, label: meta.label, fraction };
  };

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: 8, paddingBottom: 10 }}>
        <Text style={t.h1}>{tr("goTitle")}</Text>
        <Text style={t.tiny}>{event?.name ?? ""}</Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: 11, paddingBottom: 26 }} showsVerticalScrollIndicator={false}>
        {/* Safest way out */}
        <Card tone={COLORS.cyanLight}>
          <View style={s.row}>
            <Text style={{ fontSize: 17 }}>🚨</Text>
            <View style={s.grow}>
              <Text style={t.h3}>{tr("exitTitle")}</Text>
              <Text style={t.tiny}>{tr("exitBody")}</Text>
            </View>
          </View>
          <Button
            label={exitBusy ? tr("exitFinding") : exit ? tr("exitBtnAgain") : tr("exitBtn")}
            onPress={findExit}
            loading={exitBusy}
            disabled={!sharing && !fix}
            style={{ marginTop: 8, height: 44 }}
          />
          {!fix ? <Text style={t.tiny}>{tr("exitNeedGps")}</Text> : null}
        </Card>

        {exitMessage ? (
          <Banner tone={COLORS.warning}>
            <Text style={[t.body, { color: "#fde68a" }]}>{exitMessage}</Text>
          </Banner>
        ) : null}

        {/* The chosen exit */}
        {exit ? (
          <Card tone={exit.unsafe || exit.allRoutesRisky ? COLORS.warning : RISK_META.NORMAL.color}>
            <View style={s.between}>
              <View style={s.grow}>
                <Label>{tr("headingFor")}</Label>
                <Text style={[t.h2, { marginTop: 2 }]}>{exit.gateName}</Text>
              </View>
              <Badge tone={routeTone(exit.maxRisk, exit.measuredFraction).color}>
                {routeTone(exit.maxRisk, exit.measuredFraction).label}
              </Badge>
            </View>

            <View style={[s.between, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.line }]}>
              <View>
                <Label>{tr("distance")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>{formatDistance(exit.distanceMeters) ?? "—"}</Text>
              </View>
              <View>
                <Label>{tr("walkTime")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>{formatEta(exit.durationSec) ?? "—"}</Text>
              </View>
              <View>
                <Label>{tr("measured")}</Label>
                <Text style={[t.h3, { marginTop: 2 }]}>
                  {exit.measuredFraction != null ? `${Math.round(exit.measuredFraction * 100)}%` : "—"}
                </Text>
              </View>
            </View>

            {exit.directions ? <Text style={[t.body, { marginTop: 6 }]}>{exit.directions}</Text> : null}

            {/* Never let an unmeasured route read as a cleared one. */}
            {exit.maxRisk == null ? (
              <Text style={[t.tiny, { color: "#fde68a" }]}>
                {tr("routeCondition")}: {tr("notMeasured")}
              </Text>
            ) : exit.measuredFraction != null && exit.measuredFraction < 1 ? (
              <Text style={t.tiny}>
                {Math.round((1 - exit.measuredFraction) * 100)}% {tr("unmeasuredStretch")}
              </Text>
            ) : null}

            {exit.allRoutesRisky ? <Text style={[t.body, { color: "#fde68a" }]}>{tr("exitRisky")}</Text> : null}

            {/* Alternatives, so the app spreads people instead of funnelling
                every phone to one gate. */}
            {exit.alternatives.length ? (
              <View style={{ gap: 4, marginTop: 4 }}>
                <Label>{tr("anotherWay")}</Label>
                {exit.alternatives.map((alt) => (
                  <Text key={alt.gateId} style={t.small}>
                    {alt.gateName} · {formatDistance(alt.distanceMeters)}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Destinations */}
        <Label>{tr("orPickDestination")}</Label>
        {destinations.length === 0 ? (
          <Card style={s.cardTight}>
            <Text style={t.small}>{tr("noDestinations")}</Text>
          </Card>
        ) : (
          destinations.map((destination) => {
            const state = stateOf(destination.id);
            const closed = state === "closed";
            const busy = guidanceBusy === destination.id;
            return (
              <Pressable
                key={destination.id}
                onPress={closed ? undefined : () => routeTo(destination)}
                style={[
                  s.card,
                  s.cardTight,
                  { flexDirection: "row", alignItems: "center", gap: 10 },
                  closed && { opacity: 0.45 },
                ]}
              >
                <Ionicons
                  name={destination.type === "gate" || destination.type === "exit" ? "exit-outline" : "location-outline"}
                  size={18}
                  color={COLORS.cyanLight}
                />
                <View style={s.grow}>
                  <Text style={t.h3}>{destination.name}</Text>
                  <Text style={t.tiny}>
                    {closed ? tr("closedByControl") : busy ? tr("guidanceLoading") : destination.type}
                  </Text>
                </View>
                <Badge tone={closed ? COLORS.danger : RISK_META.NORMAL.color}>
                  {closed ? tr("closed") : tr("open")}
                </Badge>
              </Pressable>
            );
          })
        )}

        {/* Guidance for the picked destination */}
        {guidance ? (
          <Card tone={guidance.hold ? COLORS.warning : COLORS.cyanLight}>
            <Text style={t.body}>{guidance.instruction}</Text>
            {guidance.hold ? (
              <Text style={[t.small, { color: "#fde68a" }]}>{tr("holdWarn")}</Text>
            ) : null}
            {guidance.route ? (
              <View style={[s.between, { marginTop: 6 }]}>
                <Text style={t.small}>{formatDistance(guidance.route.lengthM)}</Text>
                <Text style={t.small}>{formatEta(guidance.route.etaSec)}</Text>
                <Badge tone={routeTone(guidance.route.worstDensity, guidance.route.measuredFraction).color}>
                  {routeTone(guidance.route.worstDensity, guidance.route.measuredFraction).label}
                </Badge>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("antiHerdNote")}</Text>
      </ScrollView>
    </Screen>
  );
}
