import { Ionicons } from "@expo/vector-icons";
import { Camera, GeoJSONSource, Layer, Map, UserLocation } from "@maplibre/maplibre-react-native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import {
  DEFAULT_MAP_STYLE,
  DENSITY_META,
  MAP_ATTRIBUTION,
  MAP_ZOOM,
  NO_DATA_META,
  RISK_META,
  densityMeta,
  riskMeta,
  riskRank,
} from "@crowdshield/config";
import { useApp } from "../../src/state/AppProvider";
import { useFeed } from "../../src/state/FeedProvider";
import { formatEta, formatPeople, readSituation } from "../../src/situation";
import { COLORS, RADIUS, s, t, tint } from "../../src/theme";
import { Badge, Button, Pill } from "../../src/ui";

/** A soft pulsing ring behind a solid dot — draws the eye to the live hotspot. */
function PulseDot({ color, pulse }: { readonly color: string; readonly pulse: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 950, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [a, pulse]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      {pulse ? (
        <Animated.View
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          }}
        />
      ) : null}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

/**
 * The live map — full-bleed, with a bottom sheet carrying the decision.
 *
 * MapLibre over OpenFreeMap rather than Google Maps: no API key, no billing
 * account, no quota. The rest of the product already runs on OpenStreetMap — the
 * router walks an imported OSM road network — so the tiles come from the same
 * data the routing does.
 *
 * Only what is inside the coverage boundary is drawn. That boundary is the privacy
 * contract, not a viewport: nothing outside it is monitored, so nothing outside it
 * is shown.
 *
 * Crowd density is drawn as two stacked circle layers whose radius grows with
 * zoom. That is what makes neighbouring cells visually merge into a single body of
 * people as you zoom out, instead of staying a grid of separate dots — the same
 * thing the server-side cluster tracker does to the numbers.
 */
export default function MapScreen() {
  const { t: tr, fix, sharing } = useApp();
  // One shared feed for the whole app — no second socket, no venue re-fetch here.
  const { frame, status, venue, yourZone } = useFeed();

  const situation = useMemo(() => readSituation(frame, { fix, yourZone }), [frame, fix, yourZone]);

  // The single worst zone right now, for the on-map early-warning badge — the
  // same idea as the web command map, so a citizen sees the time-to-critical on
  // the map itself rather than having to read a number elsewhere.
  const hotspot = useMemo(() => {
    const zones = frame?.zones ?? [];
    const ranked = zones
      .filter((z) => z.riskLevel && riskRank(z.riskLevel) >= riskRank("ELEVATED"))
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
    return ranked[0] ?? null;
  }, [frame]);
  const hotspotEta = hotspot ? formatEta(hotspot.forecast?.etaCriticalSec) : null;
  const hotspotUrgent = hotspot?.riskLevel === "HIGH" || hotspot?.riskLevel === "CRITICAL";

  /** Own fix → event coordinates → coverage centroid. GeoJSON order is [lng, lat]. */
  const fallbackCentre = useMemo<[number, number]>(() => {
    const ring = venue?.aor.polygon ?? [];
    if (ring.length) {
      const lat = ring.reduce((acc, p) => acc + p[0], 0) / ring.length;
      const lng = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
      return [lng, lat];
    }
    return [78.9629, 20.5937];
  }, [venue]);

  /**
   * The camera is declarative: `null` means "leave it where the user put it".
   * Driving it from state rather than a ref means a pan is never fought by a
   * re-render, which is what makes the map feel stuck.
   */
  const [camera, setCamera] = useState<{ center: [number, number]; zoom: number } | null>(null);

  // Frame the venue once, when its geometry first arrives.
  useEffect(() => {
    if (venue && !camera) setCamera({ center: fallbackCentre, zoom: MAP_ZOOM.overview });
  }, [venue, camera, fallbackCentre]);

  const recentre = useCallback(() => {
    if (!fix) return;
    setCamera({ center: [fix.lng, fix.lat], zoom: MAP_ZOOM.street });
  }, [fix]);

  /* ---------- GeoJSON built from live data ---------- */

  /** The monitored boundary. Backend rings are [lat,lng]; GeoJSON needs [lng,lat]. */
  const coverage = useMemo(() => {
    const ring = venue?.aor.polygon ?? [];
    if (ring.length < 3) return null;
    const coords: number[][] = ring.map(([lat, lng]) => [lng, lat]);
    // GeoJSON polygons must close explicitly.
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coords.push([...first]);
    return {
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [coords] },
      properties: {},
    };
  }, [venue]);

  /** One point per occupied hexagon, carrying its band colour. */
  const crowd = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (frame?.cells ?? []).map((cell) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [cell.center[1], cell.center[0]] },
        properties: { color: densityMeta(cell.level).color, people: cell.personsEst },
      })),
    }),
    [frame]
  );

  /** Gates and destinations, named. A closed gate is dimmed, never hidden. */
  const nodes = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (venue?.nodes ?? []).map((node) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [node.at[1], node.at[0]] },
        properties: {
          label: node.name ?? node.id,
          closed: node.state === "closed" ? 1 : 0,
          color: node.state === "closed" ? COLORS.danger : COLORS.success,
        },
      })),
    }),
    [venue]
  );

  /** Corridors the authority drew, as context beneath the crowd. */
  const corridors = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (venue?.edges ?? []).map((edge) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: edge.path.map(([lat, lng]) => [lng, lat]),
        },
        properties: {},
      })),
    }),
    [venue]
  );

  return (
    <View style={s.screen}>
      <Map
        style={{ flex: 1 }}
        mapStyle={DEFAULT_MAP_STYLE}
        logo={false}
        attribution={false}
        touchRotate={false}
        touchPitch={false}
      >
        <Camera
          center={camera?.center ?? fallbackCentre}
          zoom={camera?.zoom ?? MAP_ZOOM.overview}
          duration={600}
        />

        {coverage ? (
          <GeoJSONSource id="coverage" data={coverage}>
            <Layer
              id="coverage-fill"
              type="fill"
              paint={{ "fill-color": tint(COLORS.cyanLight, 0.06) }}
            />
            <Layer
              id="coverage-line"
              type="line"
              paint={{
                "line-color": tint(COLORS.cyanLight, 0.55),
                "line-width": 2,
                "line-dasharray": [3, 2],
              }}
            />
          </GeoJSONSource>
        ) : null}

        {corridors.features.length ? (
          <GeoJSONSource id="corridors" data={corridors}>
            <Layer
              id="corridors-line"
              type="line"
              paint={{ "line-color": "rgba(255,255,255,0.18)", "line-width": 3 }}
            />
          </GeoJSONSource>
        ) : null}

        {crowd.features.length ? (
          <GeoJSONSource id="crowd" data={crowd}>
            {/* Soft halo — this is what makes adjacent cells read as one crowd. */}
            <Layer
              id="crowd-halo"
              type="circle"
              paint={{
                "circle-color": ["get", "color"],
                "circle-opacity": 0.2,
                "circle-blur": 1.1,
                "circle-radius": [
                  "interpolate",
                  ["exponential", 2],
                  ["zoom"],
                  11,
                  3,
                  20,
                  95,
                ],
              }}
            />
            <Layer
              id="crowd-core"
              type="circle"
              paint={{
                "circle-color": ["get", "color"],
                "circle-opacity": 0.55,
                "circle-radius": [
                  "interpolate",
                  ["exponential", 2],
                  ["zoom"],
                  11,
                  1.5,
                  20,
                  44,
                ],
              }}
            />
          </GeoJSONSource>
        ) : null}

        {nodes.features.length ? (
          <GeoJSONSource id="nodes" data={nodes}>
            <Layer
              id="nodes-dot"
              type="circle"
              paint={{
                "circle-color": ["get", "color"],
                "circle-radius": 6,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#04121c",
                "circle-opacity": ["case", ["==", ["get", "closed"], 1], 0.45, 1],
              }}
            />
            <Layer
              id="nodes-label"
              type="symbol"
              layout={{
                "text-field": ["get", "label"],
                // Must be named explicitly. Left unset, MapLibre asks for its
                // built-in default stack ("Open Sans Regular,Arial Unicode MS
                // Regular"), which OpenFreeMap does not host — the glyph range
                // 404s and every label on the map silently disappears. The
                // OpenFreeMap styles only ship Noto Sans.
                "text-font": ["Noto Sans Regular"],
                "text-size": 11,
                "text-offset": [0, 1.3],
                "text-anchor": "top",
                "text-allow-overlap": false,
              }}
              paint={{
                "text-color": "#e2e8f0",
                "text-halo-color": "#020617",
                "text-halo-width": 1.4,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {sharing ? <UserLocation animated /> : null}
      </Map>

      {/* On-map early warning: worst zone + time-to-critical, pinned top-centre.
          Pulses at HIGH/CRITICAL so the danger is the loudest thing on screen. */}
      {hotspot ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, top: 52, alignItems: "center" }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              maxWidth: "88%",
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: RADIUS.pill,
              borderWidth: 1,
              borderColor: riskMeta(hotspot.riskLevel).color,
              backgroundColor: "rgba(2,6,23,0.9)",
            }}
          >
            <PulseDot color={riskMeta(hotspot.riskLevel).color} pulse={!!hotspotUrgent} />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
              {riskMeta(hotspot.riskLevel).label} · {hotspot.name}
              {hotspotEta ? ` · ${tr("criticalIn")} ~${hotspotEta}` : ""}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Controls */}
      <View style={{ position: "absolute", right: 12, top: 52, gap: 8 }}>
        <Pressable onPress={recentre} disabled={!fix}>
          <Pill tone={fix ? COLORS.cyanLight : undefined}>
            <Ionicons name="locate" size={13} color={fix ? COLORS.cyanLight : "#94a3b8"} />
            <Text
              style={{
                color: fix ? COLORS.cyanLight : "#94a3b8",
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {tr("recentre")}
            </Text>
          </Pill>
        </Pressable>
        {status === "offline" ? <Pill tone={COLORS.danger}>{tr("noSignal")}</Pill> : null}
      </View>

      {/* Licence attribution — an ODbL obligation wherever OSM tiles are shown. */}
      <Text
        style={{
          position: "absolute",
          left: 8,
          bottom: 4,
          fontSize: 8.5,
          color: "rgba(226,232,240,0.55)",
        }}
      >
        {MAP_ATTRIBUTION}
      </Text>

      {/* Bottom sheet */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: COLORS.line,
          backgroundColor: "rgba(2,6,23,0.94)",
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          padding: 16,
          paddingBottom: 20,
          gap: 10,
        }}
      >
        <View
          style={{
            width: 38,
            height: 4,
            borderRadius: 9,
            backgroundColor: "rgba(255,255,255,0.2)",
            alignSelf: "center",
          }}
        />

        {/* Legend: what the coloured circles on the map mean. Without it the map
            is a field of colours a citizen has to guess at. Compact, one line. */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {[
            { c: DENSITY_META.comfortable.color, l: tr("legendCalm") },
            { c: DENSITY_META.dense.color, l: tr("legendBusy") },
            { c: DENSITY_META.critical.color, l: tr("legendPacked") },
            { c: COLORS.success, l: tr("legendGate") },
          ].map((item) => (
            <View key={item.l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: item.c }} />
              <Text style={t.tiny}>{item.l}</Text>
            </View>
          ))}
        </View>
        <View style={s.divider} />

        <View style={s.between}>
          <View style={s.grow}>
            <Text style={t.h3} numberOfLines={1}>
              {situation.zone?.name ??
                (situation.kind === "unmeasured" ? tr("levelUnknown") : tr("allClear"))}
            </Text>
            <Text style={t.tiny}>
              {situation.kind === "unmeasured"
                ? tr("unknownBody")
                : situation.zone
                  ? `${situation.zone.density} p/m²`
                  : ""}
            </Text>
          </View>
          <Badge tone={situation.color}>{situation.levelLabel}</Badge>
        </View>

        <View style={s.row}>
          <Pill>
            {situation.personsEst != null && situation.personsEst > 0
              ? `~${formatPeople(situation.personsEst)} ${tr("inArea")}`
              : NO_DATA_META.label}
          </Pill>
          <Pill>{`${frame?.cells?.length ?? 0} cells`}</Pill>
        </View>

        <Button label={tr("routeMeAway")} onPress={() => router.push("/(tabs)/go")} />
      </View>
    </View>
  );
}
