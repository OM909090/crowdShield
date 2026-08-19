/**
 * @crowdshield/config — constants every client shares.
 *
 * Consumed as TypeScript source (no build step): Metro and Vite both transpile
 * it, and `tsc` type-checks it. Nothing here imports React, Node or any platform
 * API, so it is safe in a browser, in React Native, and in a script.
 */
export * from "./domain";
export * from "./endpoints";
export * from "./i18n";
export * from "./maps";
export * from "./risk";
export * from "./theme";
