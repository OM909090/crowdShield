import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../../venueMap.css";
import { Search, LocateFixed, Loader2, X } from "lucide-react";
import { venueIcon } from "./mapIcons";

/**
 * LocationPicker — pick an event's location on a map instead of typing a venue
 * name and a full address.
 *
 * The authority searches a place (OpenStreetMap Nominatim), or just clicks the
 * map, and we drop a pin and reverse-geocode it into a suggested venue name +
 * address. The parent owns the picked point (`value`) and receives updates via
 * `onChange` ({ lat, lng }) and `onResolved` ({ venueName, address }); the fine-
 * grained coverage area is still drawn later in the Map Editor.
 *
 * Nominatim is called from the browser (it sends permissive CORS headers). We
 * debounce search to one request ~600ms after typing stops and reverse-geocode
 * only once per pin drop, which keeps us well inside its fair-use policy.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";
const DEFAULT_CENTER = [20.5937, 78.9629]; // India, so the first view isn't the ocean
const DEFAULT_ZOOM = 5;
const PICKED_ZOOM = 16;

/** Pull a short, human venue label out of a Nominatim address/display_name. */
function labelFrom(entry) {
  const a = entry?.address || {};
  return (
    a.amenity ||
    a.building ||
    a.tourism ||
    a.leisure ||
    a.stadium ||
    a.road ||
    a.neighbourhood ||
    a.suburb ||
    a.village ||
    a.town ||
    a.city ||
    entry?.name ||
    (entry?.display_name || "").split(",")[0] ||
    ""
  );
}

/** Fly the map to the picked point whenever it changes (MapContainer center is
 *  only honoured on first render, so this handles every later update). */
function Recenter({ target, zoom }) {
  const map = useMap();
  const lat = target?.[0];
  const lng = target?.[1];
  useEffect(() => {
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.6 });
  }, [map, lat, lng, zoom]);
  return null;
}

/** Turn a map click into a picked point. */
function ClickToPick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange, onResolved }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  const pos = value && value.lat != null && value.lng != null ? [value.lat, value.lng] : null;

  // After choosing a result / dropping a pin we set the query text; that must
  // not immediately re-trigger the search-as-you-type effect below.
  const skipSearch = useRef(false);

  const runSearch = useCallback(async (term) => {
    const q = term.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `${NOMINATIM}/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search-as-you-type.
  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    const t = setTimeout(() => runSearch(query), 600);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const reverseGeocode = useCallback(async (lat, lng) => {
    setResolving(true);
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } }
      );
      return await res.json();
    } catch {
      return null;
    } finally {
      setResolving(false);
    }
  }, []);

  // Drop / move the pin, then resolve a name + address for it.
  const pick = useCallback(
    async (lat, lng) => {
      onChange?.({ lat, lng });
      const data = await reverseGeocode(lat, lng);
      const venueName = labelFrom(data);
      onResolved?.({
        venueName: venueName || `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        address: data?.display_name || "",
      });
    },
    [onChange, onResolved, reverseGeocode]
  );

  const chooseResult = (r) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    skipSearch.current = true;
    setQuery((r.display_name || "").split(",").slice(0, 2).join(", "));
    setResults([]);
    onChange?.({ lat, lng });
    onResolved?.({ venueName: labelFrom(r) || (r.display_name || "").split(",")[0], address: r.display_name || "" });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        pick(p.coords.latitude, p.coords.longitude);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div>
      {/* Search + locate-me */}
      <div className="relative z-[500]">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place — e.g. Grand Road, Puri"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3 pl-10 pr-9 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
            />
            {(searching || query) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
            title="Use my current location"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </button>
        </div>

        {/* Results dropdown */}
        {results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-[600] mt-2 max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 py-1 shadow-xl shadow-black/40 backdrop-blur">
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => chooseResult(r)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/5"
                >
                  <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300/70" />
                  <span className="leading-5">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div className="relative mt-2 h-64 overflow-hidden rounded-2xl border border-white/10">
        <MapContainer
          center={pos || DEFAULT_CENTER}
          zoom={pos ? PICKED_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: "#0b1120" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <ClickToPick onPick={pick} />
          <Recenter target={pos} zoom={PICKED_ZOOM} />
          {pos && <Marker position={pos} icon={venueIcon()} />}
        </MapContainer>

        {/* Hint overlay before anything is picked */}
        {!pos && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-slate-950/90 to-transparent px-4 py-3 text-center text-xs text-slate-300">
            Search above, click the map, or use your location to drop the venue pin
          </div>
        )}
      </div>

      {/* Picked coordinate readout */}
      <div className="mt-2 flex items-center justify-between text-xs">
        {pos ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Pinned at {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
          </span>
        ) : (
          <span className="text-slate-500">No location pinned yet</span>
        )}
        {resolving && (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> resolving address…
          </span>
        )}
      </div>
    </div>
  );
}
