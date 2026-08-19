# CrowdShield

An AI-powered early-warning system for preventing crowd stampedes, built for
TechNova Problem Statement 1. One API, two clients: a control-room console for
authorities and an Android companion for the people in the crowd.

The only sensor is a citizen's phone sharing anonymised location. There are no
cameras, no drones and no fixed hardware — density is inferred from H3 hexagon
aggregates, so the system sees crowds rather than people.

## Layout

```
crowdshield/
├── apps/
│   ├── web/                 Authority console — Vite + React 19 + Tailwind v4
│   └── mobile/              Android citizen app — Expo SDK 57 + Expo Router
├── packages/
│   ├── config/              Risk vocabulary, density bands, languages, endpoints
│   ├── types/               TypeScript contracts for every API response
│   ├── validation/          Zod schemas mirroring the backend validators
│   └── api-client/          One typed client, used by both apps
├── backend/                 Express + MongoDB + Socket.IO API
└── docs/                    Architecture, progress, and the mobile design review
```

`backend/` sits at the root rather than under `apps/` because it is not a client;
it is the thing both clients talk to.

## The rule that shapes the whole repo

**The backend does not know which client is calling.** There is no `/web-api` and
no `/android-api`. Both clients hit the same routes, pass the same validators and
authenticate the same way, so a behaviour verified once is verified for both.

What is shared, and what deliberately is not:

| Shared | Not shared |
|---|---|
| Types, API client, validation schemas | UI components |
| Risk colours and level vocabulary | Navigation (sidebar vs bottom tabs) |
| Endpoint paths, socket event names | Map rendering (Leaflet vs react-native-maps) |
| Business constants, i18n language set | Screen layout and interaction |

A desktop navbar and an Android bottom bar solve different problems. Sharing the
contract is what keeps the two honest; sharing the UI would make both worse.

## Running it

Requires Node 20.19+ and a local MongoDB.

```bash
npm install                 # installs every workspace
cp .env.example backend/.env   # then fill in the secrets

npm run api                 # API on :5000
npm run web                 # console on :5173
npm run mobile              # Metro; press a for Android
```

The mobile app resolves the API automatically: the Metro host during development
(so a physical device on the same Wi-Fi just works), or `10.0.2.2` on the Android
emulator. Override with `EXPO_PUBLIC_API_URL`.

## Verifying

```bash
npm run typecheck           # the four shared packages
npm run typecheck:mobile    # the Android app
npm run lint                # the web console
npm run build:web
```

Current expected state: packages and mobile typecheck clean; the web console
reports **5 pre-existing lint problems** (2 errors, 3 warnings) — a set-state-in-effect
and a fast-refresh export in `AuthContext.jsx`, plus three
`react-hooks/incompatible-library` warnings from React Hook Form. Treat any change
in that count as a regression.

For the Android app, `npx expo export --platform android` is the useful check: it
bundles everything and fails on a bad import, which a typecheck will not catch.

## Session and auth

The API authenticates with two httpOnly cookies (`accessToken` ~15 min,
`refreshToken` 7 days) and reads the access token from `req.cookies` only. The web
client lets the browser handle that. React Native has no dependable cookie jar
across cold starts, so the mobile client captures `Set-Cookie`, stores the pair in
the OS keystore via `expo-secure-store`, and replays a `Cookie` header — the wire
format the server already expects. No backend change was needed, and none was made.

## Android distribution and updates

Built as an APK for pilot deployment rather than published to the Play Store, so
the app updates itself: it polls `https://api.github.com/repos/{owner}/{repo}/releases/latest`,
compares the tag against the installed version, downloads the attached `.apk` and
hands it to Android's package installer.

Three constraints worth knowing:

- Set `EXPO_PUBLIC_UPDATE_REPO` to `owner/repo`, or update checking stays off.
- The release must have a `.apk` asset attached; a tag alone is not enough.
- This only works outside the Play Store. Play policy forbids self-updating apps,
  so a store build must use the store.

## Versions

Expo SDK 57 pins **react-native 0.86.2**, and it must be an exact pin — a caret
range lets npm resolve 0.87.0, which drops a file `@expo/metro-config` still
requires, and the bundle fails. When adding a native module use
`npx expo install`, which reads the SDK's own version map, rather than
`npm install`.

## Documentation

- `docs/ARCHITECTURE.md` — system design and the reasoning behind it
- `docs/PROGRESS.md` — what is built, verified, and known to be missing
- `docs/design/mobile/index.html` — the Android screen designs, openable in a browser
