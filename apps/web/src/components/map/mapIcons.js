import L from "leaflet";

/**
 * Marker taxonomy shared across the map + editor UI.
 * `emoji` is rendered inside a colored pin; `color` also drives the legend.
 */
export const MARKER_TYPES = [
  { value: "Barricade", color: "#f97316", emoji: "\u{1F6A7}" },
  { value: "Blocked Path", color: "#ef4444", emoji: "\u26D4" },
  { value: "Safe Zone", color: "#22c55e", emoji: "\u{1F7E2}" },
  { value: "Medical Tent", color: "#ec4899", emoji: "\u2695\uFE0F" },
  { value: "Entry Gate", color: "#22d3ee", emoji: "\u{1F6AA}" },
  { value: "Exit Gate", color: "#38bdf8", emoji: "\u{1F6AA}" },
  { value: "Security Post", color: "#818cf8", emoji: "\u{1F6E1}\uFE0F" },
  { value: "Other", color: "#94a3b8", emoji: "\u{1F4CD}" },
];

const FALLBACK = MARKER_TYPES[MARKER_TYPES.length - 1];

export const typeMeta = (type) => MARKER_TYPES.find((t) => t.value === type) || FALLBACK;

// Build a divIcon ONCE per marker type and reuse it. Previously a fresh
// L.divIcon was allocated for every marker on every render, which churns
// DOM + GC as marker counts grow. Icons are immutable, so caching is safe.
const iconCache = new Map();

export function markerIcon(type) {
  if (iconCache.has(type)) return iconCache.get(type);
  const meta = typeMeta(type);
  const icon = L.divIcon({
    className: "cs-marker",
    html: `<div class="cs-marker__pin" style="--cs:${meta.color}">${meta.emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
  iconCache.set(type, icon);
  return icon;
}

let venueIconRef = null;

export function venueIcon() {
  if (venueIconRef) return venueIconRef;
  venueIconRef = L.divIcon({
    className: "cs-marker",
    html: `<div class="cs-marker__venue">\u{1F3DF}\uFE0F</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
  return venueIconRef;
}
