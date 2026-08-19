/**
 * Base-map configuration — deliberately free and keyless.
 *
 * The product runs on OpenStreetMap data end to end: the road network the router
 * uses is imported from OSM, and the tiles under the crowd come from OpenFreeMap,
 * which serves OSM-derived vector tiles with no account, no key and no request
 * quota. That is a design requirement, not a cost saving — a deployment for a
 * district administration should not fail because a billing card expired, and the
 * only sensor being a citizen's phone is pointless if the map behind it is
 * metered.
 *
 * The `dark` style is used because the whole product is dark-themed; a light
 * basemap under bright density overlays reads as a different application.
 *
 * Attribution is a licence obligation, not a courtesy: ODbL requires crediting
 * OpenStreetMap contributors wherever these tiles are shown.
 */
export declare const MAP_STYLES: {
    readonly dark: "https://tiles.openfreemap.org/styles/dark";
    readonly positron: "https://tiles.openfreemap.org/styles/positron";
    readonly liberty: "https://tiles.openfreemap.org/styles/liberty";
};
export type MapStyleName = keyof typeof MAP_STYLES;
export declare const DEFAULT_MAP_STYLE: "https://tiles.openfreemap.org/styles/dark";
/** Shown on the map. Required by the OpenStreetMap licence. */
export declare const MAP_ATTRIBUTION = "\u00A9 OpenStreetMap contributors \u00B7 OpenFreeMap";
/**
 * Zoom levels used across the app, so the phone and the console frame a venue the
 * same way.
 */
export declare const MAP_ZOOM: {
    /** The whole coverage area. */
    readonly overview: 14;
    /** Working zoom: streets legible, a few hundred metres across. */
    readonly street: 16;
    /** Following a route on foot. */
    readonly navigate: 17.5;
};
/**
 * Radius in metres drawn for one H3 cell of crowd.
 *
 * At the analysis resolution (11) a cell is roughly 25 m across, so this slightly
 * over-draws to make neighbouring cells visually merge into one body of people —
 * which is what a crowd actually looks like from above, and is the behaviour the
 * cluster tracker already models in the data.
 */
export declare const CELL_RADIUS_M = 22;
