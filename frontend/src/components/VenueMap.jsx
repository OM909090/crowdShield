import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../venueMap.css";
import { Trash2 } from "lucide-react";

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

const typeMeta = (type) => MARKER_TYPES.find((t) => t.value === type) || MARKER_TYPES.at(-1);

const buildIcon = (type) => {
  const meta = typeMeta(type);
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${meta.color};border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 12px ${meta.color}99;font-size:15px;">${meta.emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

// Distinct pin for the venue itself — bigger, gradient-filled, always
// present regardless of editable state, so it never gets confused with an
// authority-placed marker.
const buildVenueIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="width:44px;height:44px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#22d3ee,#3b82f6);border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 24px rgba(34,211,238,0.55);font-size:20px;">\u{1F3DF}\uFE0F</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

function ClickCapture({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

/**
 * center: [lat, lng] — the event's venue coordinates (geocoded server-side
 *   from venue name + address, or a precise pin the authority dropped)
 * venue: { name, address } — shown in the venue pin's popup
 * markers: [{ _id, type, label, note, lat, lng }] — authority-placed annotations
 * editable: when true, clicking the map fires onMapClick({lat,lng}) and each
 *   marker popup shows a remove button wired to onDeleteMarker(id)
 */
export default function VenueMap({ center, venue, markers = [], editable = false, onMapClick, onDeleteMarker }) {
  return (
    <MapContainer center={center} zoom={16} scrollWheelZoom className="h-full w-full" style={{ background: "#0b1120" }}>
      {/* Dark basemap (CARTO, free, no API key) so the map matches the app instead of stock white OSM tiles */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {editable && <ClickCapture onMapClick={onMapClick} />}

      <Marker position={center} icon={buildVenueIcon()}>
        <Popup className="venue-map-popup">
          <div className="min-w-[180px] text-sm">
            <p className="font-semibold text-white">{venue?.name || "Venue"}</p>
            {venue?.address && <p className="mt-1 text-xs text-slate-400">{venue.address}</p>}
          </div>
        </Popup>
      </Marker>

      {markers.map((m) => (
        <Marker key={m._id} position={[m.lat, m.lng]} icon={buildIcon(m.type)}>
          <Popup className="venue-map-popup">
            <div className="min-w-[160px] text-sm">
              <p className="font-semibold text-white">{m.type}</p>
              {m.label && <p className="mt-1 text-slate-300">{m.label}</p>}
              {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
              {editable && (
                <button
                  onClick={() => onDeleteMarker(m._id)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-red-400 hover:underline"
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
