/**
 * Coordinate conventions — the single most common source of bugs in this
 * codebase, so they are named in the type system rather than left to comments.
 *
 * The backend uses `[lat, lng]` (Leaflet order) EVERYWHERE except MongoDB
 * geo fields, which are GeoJSON and therefore `[lng, lat]`. Mixing them puts a
 * venue in the Indian Ocean. Both orders exist here as distinct named types so a
 * conversion is a deliberate call to `fromGeoJson`, not an accident.
 */
/** `[latitude, longitude]` — the internal convention across the API. */
export type LatLng = readonly [number, number];
/** `[longitude, latitude]` — MongoDB / GeoJSON order only. */
export type GeoJsonCoords = readonly [number, number];
/** A closed or open ring of points, in `[lat, lng]`. */
export type Ring = readonly LatLng[];
/** A polyline, in `[lat, lng]`. */
export type Path = readonly LatLng[];
export interface GeoJsonPoint {
    readonly type: "Point";
    readonly coordinates: GeoJsonCoords;
}
/** Convert a GeoJSON point to the internal `[lat, lng]` order. */
export declare const fromGeoJson: (point: GeoJsonPoint | null | undefined) => LatLng | null;
/** A device's live fix, as the phone reports it. */
export interface Fix {
    readonly lat: number;
    readonly lng: number;
    /** Compass heading in degrees, when the device knows it. */
    readonly heading?: number | undefined;
    /** Ground speed in m/s, when the device knows it. */
    readonly speed?: number | undefined;
}
