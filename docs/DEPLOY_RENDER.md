# Hosting the backend on Render

Goal: a public HTTPS backend so the Android app works on **any device, anywhere**
— no `adb reverse`, no laptop on the same Wi-Fi. The backend code is unchanged;
it already reads `PORT`, `MONGO_URI`, `CLIENT_URL` and the JWT secrets from the
environment. `render.yaml` (repo root) wires those into Render.

## 1. Database (MongoDB Atlas — free)

Render has no managed MongoDB, so use Atlas:

1. Create a free **M0** cluster at mongodb.com/atlas.
2. Database Access → add a user (username + password).
3. Network Access → allow `0.0.0.0/0` (Render egress IPs are dynamic on the free
   tier).
4. Copy the connection string and append the db name:
   `mongodb+srv://USER:PASS@cluster.abc.mongodb.net/crowd_help`

## 2. Deploy the backend

**Blueprint (recommended):** push this repo to GitHub → Render → New → Blueprint
→ pick the repo. Render reads `render.yaml` and creates the `crowdshield-api`
web service.

Then set the values marked `sync: false` in the service's Environment tab:

| Key | Value |
|-----|-------|
| `MONGO_URI` | the Atlas string from step 1 |
| `CLIENT_URL` | the web console origin (browser CORS only; the app doesn't need it) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_MOBILE` | optional, for `npm run seed:admin` |

`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are generated automatically.
`NODE_ENV=production` and the expiries are set by the blueprint. **Do not set
`PORT`** — Render injects it.

You get a URL like `https://crowdshield-api.onrender.com`. Verify:

```
curl https://crowdshield-api.onrender.com/api/health   # -> {"status":"ok"}
```

Seed the demo data once (Render Shell, or locally with `MONGO_URI` pointed at
Atlas): `npm run seed:admin` and `npm run seed:demo`.

## 3. Point the Android app at it

Two ways — pick one:

- **Baked in (for a distributable APK):** set
  `EXPO_PUBLIC_API_URL=https://crowdshield-api.onrender.com/api` (see
  `apps/mobile/.env.example`) and rebuild.
- **Runtime, no rebuild:** open the app → Settings → **Server address**, enter
  the Render URL. The REST calls, the live Socket.IO feed, and the AI assistant
  all follow this override (fixed this session — they used to ignore it).

WebSockets work on Render, so the `crowd:tick` / `alert:new` / `agent:broadcast`
feed streams over `wss://` automatically.

## 4. Notes / gotchas

- **Free tier sleeps** after ~15 min idle; the next request cold-starts in ~50s.
  Fine for a demo; use a paid instance or an external pinger to keep warm.
- **Web console cross-origin:** the browser app needs `CLIENT_URL` set to its
  own origin, and cross-site auth cookies require `SameSite=None; Secure`. The
  **mobile app is unaffected** — it replays a captured cookie, not a browser
  cookie. (Hosting the web console cross-origin is a separate follow-up.)
- **Node version:** the service runs on Render's default Node (20+), which suits
  the ESM backend. Pin with a `NODE_VERSION` env var if needed.
