/**
 * @crowdshield/types — the shape of everything the API returns.
 *
 * Hand-written rather than generated, because the value is in the comments: the
 * `null`-means-unmeasured rule and the `[lat, lng]` vs `[lng, lat]` split are
 * the two things a new client gets wrong, and both are documented at the field.
 */
export * from "./event";
export * from "./geo";
export * from "./guidance";
export * from "./snapshot";
export * from "./user";
