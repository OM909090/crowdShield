# crowd-sim — a synthetic crowd that gathers like a real one

A test harness, not product code. It posts anonymous heartbeats to the **existing**
`POST /api/events/:id/ingest` endpoint — the same path a real phone uses — so the
backend needs no changes and nothing here can affect production behaviour.

## Why not the built-in simulator

`backend/services/simulator.js` already exists and walks agents along the venue's
drawn corridors from gates toward destinations. That is the right model for testing
throughput through a chokepoint, but it is the wrong shape for the question here:
*does the system see a crowd forming around a specific person, before it becomes
dangerous?* This harness anchors on a real device's position and grows crowds around
it, over HTTP, so it also exercises validation, auth and the ingest path itself.

## How the crowd forms

Real crowds do not appear. They accrete. The model has four phases and never
teleports a mass of people into existence:

```
seeding      a few attractor points appear inside the coverage area.
             Devices spawn ONE AT A TIME and walk toward one of them.
             On the map: single dots, scattered.

gathering    spawn rate rises gently. Devices reach their attractor and begin
             milling — small random steps, not standing still.
             On the map: dots thicken into patches, colours warm up.

surge        ONE attractor becomes hot. Its spawn share jumps and devices from
             calm attractors start migrating to it.
             On the map: a patch becomes a solid body, cells merge into a mass.

hold         spawning stops; the crowd stays and continues to mill.
             This is where you watch whether risk keeps climbing on its own.
```

The key property: growth is **monotonic and gradual**, so when an alert fires you
can read off exactly how much warning it gave. An instantaneous scatter of 5,000
devices tells you the threshold works; it tells you nothing about lead time.

## Anchoring on your real phone

With `--anchor auto` the harness reads the live snapshot first and centres the
attractors on whatever device is already reporting — i.e. the phone in your hand.
Run the app, share location, confirm you appear, then start this. Attractors are
placed 40-160 m from you, inside the coverage polygon, so the crowd builds *around*
you rather than on top of you.

## Usage

```bash
node tools/crowd-sim/simulate.mjs \
  --event 6a7cc0b71a395f2dd2512d92 \
  --anchor auto \
  --peak 600 \
  --seeds 4
```

Options:

| flag | default | meaning |
|---|---|---|
| `--event <id>` | required | event to feed |
| `--anchor auto\|lat,lng` | `auto` | centre; `auto` finds your reporting device |
| `--peak <n>` | `400` | devices at full crowd |
| `--seeds <n>` | `3` | attractor points |
| `--seed-phase <s>` | `25` | seconds of one-at-a-time spawning |
| `--gather-phase <s>` | `60` | seconds of steady growth |
| `--surge-phase <s>` | `45` | seconds of accelerated growth on one attractor |
| `--tick <ms>` | `1000` | heartbeat interval (matches the real app's 4 s ÷ 4) |
| `--api <url>` | `http://localhost:5000/api` | API base |
| `--identifier` / `--password` | demo authority | login |
| `--quiet` | off | suppress the per-second table |

## What it measures

Every tick it polls the snapshot and prints one row: devices posted, estimated
people, occupied cells, the worst zone with its risk and level, time-to-critical,
and how many alerts are active. At the end it prints a **lead-time report**:

```
FIRST WATCH      at t=31s   (density 0.62 p/m²,  312 people)
FIRST ELEVATED   at t=48s   (density 1.15 p/m²,  744 people)
FIRST HIGH       at t=72s   (density 2.34 p/m², 1520 people)
FIRST ALERT      at t=49s   severity=elevated   eta-to-critical=180s
CRITICAL DENSITY at t=96s
  → warning arrived 47s before the crowd became critical
```

That last line is the number that matters. The claim this product makes is advance
warning, and this is the only honest way to check it.

## Cleaning up

Positions live in an in-memory hot store and expire on their own; nothing synthetic
is persisted. `--stop` clears the harness's devices immediately by posting a final
empty state, and restarting the API drops everything.

Do not point this at an event the public is using. It will move the risk numbers a
real operator is reading.
