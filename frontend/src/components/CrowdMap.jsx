import {
  MapContainer,
  TileLayer,
  Circle,
  Popup,
  Marker,
  ZoomControl,
} from "react-leaflet";
import { divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = divIcon({
  className: "",
  html: `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: rgba(34, 211, 238, 0.95);
      border: 2px solid rgba(255,255,255,0.85);
      box-shadow: 0 0 18px rgba(34, 211, 238, 0.9);
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function CrowdMap() {
  const crowdPoints = [
    { id: 1, lat: 20.2961, lng: 85.8245, density: 90, risk: "High" },
    { id: 2, lat: 20.2965, lng: 85.8252, density: 45, risk: "Medium" },
    { id: 3, lat: 20.297, lng: 85.8239, density: 20, risk: "Low" },
    { id: 4, lat: 20.2956, lng: 85.826, density: 80, risk: "High" },
  ];

  const riskConfig = {
    High: { color: "#ef4444", fill: "#ef4444", opacity: 0.28 },
    Medium: { color: "#f59e0b", fill: "#f59e0b", opacity: 0.24 },
    Low: { color: "#22c55e", fill: "#22c55e", opacity: 0.2 },
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-950">
      <div className="absolute left-4 top-4 z-[500] rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-xs text-slate-200 backdrop-blur-xl">
        <p className="font-semibold text-cyan-300">Live Crowd Heat Map</p>
        <p className="mt-1 text-slate-400">Density bubbles scale with risk severity</p>
      </div>

      <div className="absolute right-4 top-4 z-[500] rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-xs text-slate-200 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
          <span>High</span>
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.9)] ml-2" />
          <span>Medium</span>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.9)] ml-2" />
          <span>Low</span>
        </div>
      </div>

      <MapContainer
        center={[20.2961, 85.8245]}
        zoom={16}
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {crowdPoints.map((point) => {
          const cfg = riskConfig[point.risk] || riskConfig.Low;

          return (
            <div key={point.id}>
              <Circle
                center={[point.lat, point.lng]}
                radius={point.density * 2.8}
                pathOptions={{
                  color: cfg.color,
                  fillColor: cfg.fill,
                  fillOpacity: cfg.opacity,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="space-y-1">
                    <h3 className="font-semibold">Crowd Zone</h3>
                    <p>Density: {point.density}%</p>
                    <p>Risk: {point.risk}</p>
                  </div>
                </Popup>
              </Circle>

              <Marker position={[point.lat, point.lng]} icon={markerIcon} />
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}