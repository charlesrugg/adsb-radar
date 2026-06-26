# adsb-radar

A live ADS-B radar dashboard powered by a local [PiAware](https://flightaware.com/adsb/piaware/) receiver.

- **Radar scope** — phosphor-green PPI display with a rotating sweep, range rings, and aircraft blips tagged with callsign, flight level, and speed.
- **Flight strip rack** — contacts listed by distance; click one to lock onto it.
- **Ticker** — scrolling strip across the bottom with every aircraft in range.

No external API, no API key, no cost — data comes straight from dump1090 on your local network.

## Requirements

- A PiAware / dump1090 receiver on your local network
- Node 20+

## Setup

```bash
node server.js
```

Open http://localhost:3000. If PiAware is unreachable it falls back to demo mode with simulated traffic.

## Configuration

Set these as environment variables or in a `.env` file:

| Variable            | Default           | Meaning                                         |
| ------------------- | ----------------- | ----------------------------------------------- |
| `PIAWARE_HOST`      | `192.168.4.188`   | IP address of your PiAware receiver             |
| `PIAWARE_HTTP_PORT` | `8080`            | dump1090 HTTP port (serves `/data/aircraft.json`) |
| `HOME_LAT`          | `40.2015`         | Radar center latitude                           |
| `HOME_LON`          | `-77.1889`        | Radar center longitude                          |
| `HOME_LABEL`        | `HOME`            | Label shown at scope center                     |
| `RANGE_NM`          | `60`              | Radar radius in nautical miles                  |
| `CACHE_SECONDS`     | `5`               | How long to reuse a cached response             |
| `PORT`              | `3000`            | Web server port                                 |

## How the data flows

```
browser ──poll /api/overhead──► server.js ──GET /data/aircraft.json──► dump1090 (PiAware)
   ▲                                │
   └──────── cached JSON ◄──────────┘  cached for CACHE_SECONDS
```

dump1090's HTTP server runs on port 8080. Port 30005 (Beast binary) is a raw TCP stream and is not used here.

## Customizing

- **Colors:** CSS tokens at the top of `index.html` (`--phos`, `--amber`, ring colors) control the whole scope.
- **Sweep speed / persistence:** `sweep=(sweep+dt*70)` sets rotation speed; `Math.exp(-delta/52)` controls blip afterglow length.
- **Range:** narrow `RANGE_NM` to focus on low traffic actually passing overhead.
