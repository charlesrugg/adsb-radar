# Overhead — a plane radar for your FlightAware account

A live dashboard with two pieces:

- **A radar scope** — a phosphor-green PPI display centered on your location, with
  a rotating sweep, range rings, and aircraft blips that bloom as the sweep passes
  them. Each blip is tagged with its callsign, flight level, and speed.
- **A ticker of the planes overhead** — a scrolling strip across the bottom listing
  every aircraft currently in range (callsign · type · route · altitude · speed · heading).

A flight-strip rack on the right lists contacts by distance; click one to lock onto it.

It pulls live traffic from **FlightAware AeroAPI** via a tiny local server that keeps
your API key off the browser. With no key set, it runs in **demo mode** with
simulated traffic so you can see it working immediately.

## Why the local server?

AeroAPI authenticates with your key in an `x-apikey` header and does **not** permit
cross-origin browser calls. So the page can't (and shouldn't) call AeroAPI directly —
that would leak your key and hit CORS errors. `server.js` holds the key, makes the
request, caches the result to protect your credits, and serves the dashboard.

## Setup

Requires Node 20+ (for built-in `fetch` and `--env-file`).

```bash
npm install
cp .env.example .env
# edit .env: add AEROAPI_KEY and set HOME_LAT / HOME_LON to your location
npm start
```

Open http://localhost:3000.

Without an `AEROAPI_KEY` it starts in demo mode — same visuals, fake planes.

## Configuration (.env)

| Variable         | Meaning                                                        |
| ---------------- | ------------------------------------------------------------- |
| `AEROAPI_KEY`    | Your AeroAPI key. Blank = demo mode.                          |
| `HOME_LAT/LON`   | Center of the radar (your location).                          |
| `HOME_LABEL`     | Short label shown at scope center (e.g. an airport ID).       |
| `RANGE_NM`       | Radar radius in nautical miles; sets the search bounding box. |
| `BELOW_ALTITUDE` | Optional altitude ceiling in *hundreds* of feet (180 = FL180).|
| `CACHE_SECONDS`  | Reuse each AeroAPI response this long. Protects your credits. |
| `MAX_PAGES`      | Result pages (15 flights each). Each page is billed.          |
| `PORT`           | Web server port (default 3000).                              |

## A note on cost

AeroAPI is **billed per query** (per page of up to 15 results). The dashboard
polls every 15 seconds, but the server only hits AeroAPI once per `CACHE_SECONDS`
and serves the cache in between, so your real query rate is roughly
`(1 / CACHE_SECONDS) × MAX_PAGES` per page. Raise `CACHE_SECONDS` or lower
`MAX_PAGES` to spend less. Check usage at the AeroAPI portal under your account.

## How the data flows

```
browser ──poll /api/overhead──► server.js ──/flights/search──► AeroAPI
   ▲                                │  (-latlong "minLat minLon maxLat maxLon")
   └──────── cached JSON ◄──────────┘  cached for CACHE_SECONDS
```

The endpoint used is `GET /flights/search` with a `-latlong` bounding box built
from your home location and `RANGE_NM`. Altitudes from AeroAPI arrive in hundreds
of feet and are converted to real feet / flight levels for display.

## Customizing

- **Look:** the CSS color tokens at the top of `public/index.html` (`--phos`,
  `--amber`, ring colors) control the whole scope. Swap green for amber for a
  classic monochrome-amber console.
- **Sweep speed / persistence:** in the script, `sweep=(sweep+dt*70)` sets rev
  speed; the `Math.exp(-delta/52)` term controls blip afterglow length.
- **What counts as "overhead":** narrow `RANGE_NM` and set `BELOW_ALTITUDE` to
  focus on low traffic actually passing over you rather than high cruisers.
