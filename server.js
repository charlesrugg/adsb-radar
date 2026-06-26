// server.js — local proxy for PiAware / dump1090
//
// Polls dump1090's built-in JSON endpoint on your local network, caches the
// result to avoid hammering the receiver, and serves the dashboard.
//
// Run with:  node server.js
// Or:        node --env-file=.env server.js   (Node 20+, to override defaults)

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- Config (from environment / .env) -------------------------------------
const PORT = parseInt(process.env.PORT || "3000", 10);

// PiAware / dump1090-fa: port 8080 is the built-in HTTP server that serves
// /data/aircraft.json. Port 30005 is Beast binary (a raw TCP stream) and
// cannot be consumed directly by a web page.
const PIAWARE_HOST = process.env.PIAWARE_HOST || "192.168.4.188";
const PIAWARE_HTTP_PORT = parseInt(process.env.PIAWARE_HTTP_PORT || "8080", 10);

// Your home location — the center of the radar.
const HOME_LAT = parseFloat(process.env.HOME_LAT || "40.2015");
const HOME_LON = parseFloat(process.env.HOME_LON || "-77.1889");
const HOME_LABEL = process.env.HOME_LABEL || "HOME";

// Radar radius in nautical miles. Aircraft beyond this are excluded.
const RANGE_NM = parseFloat(process.env.RANGE_NM || "60");

// How long (seconds) to reuse a cached response.
const CACHE_SECONDS = parseFloat(process.env.CACHE_SECONDS || "5");

const PUBLIC_DIR = path.join(__dirname);
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

// ---- Geo helpers -----------------------------------------------------------
const D2R = Math.PI / 180;
function nmPerLon(lat) { return 60 * Math.cos(lat * D2R); }
function distNm(lat, lon) {
  const dn = (lat - HOME_LAT) * 60;
  const de = (lon - HOME_LON) * nmPerLon(HOME_LAT);
  return Math.hypot(dn, de);
}

// ---- Normalize a dump1090 aircraft object ----------------------------------
// dump1090-fa uses slightly different field names depending on version; handle both.
function normalize(a) {
  if (a.lat == null || a.lon == null) return null;
  if (distNm(a.lat, a.lon) > RANGE_NM) return null;

  // altitude: newer dump1090-fa uses alt_baro; older uses altitude.
  // "ground" string means on the ground — treat as 0.
  const rawAlt = a.alt_baro ?? a.altitude;
  const altitude = rawAlt === "ground" ? 0 : (typeof rawAlt === "number" ? rawAlt : null);

  // speed: newer uses gs (ground speed), older uses speed.
  const groundspeed = a.gs ?? (typeof a.speed === "number" ? a.speed : null);

  // callsign: flight field, trim trailing spaces.
  const ident = a.flight ? a.flight.trim() : a.hex.toUpperCase();

  return {
    id: a.hex,
    ident,
    type: a.t || null,                   // ICAO type designator (if available)
    origin: null,                         // dump1090 doesn't provide route data
    dest: null,
    lat: a.lat,
    lon: a.lon,
    altitude,
    groundspeed: typeof groundspeed === "number" ? groundspeed : null,
    heading: typeof a.track === "number" ? a.track : null,
    timestamp: a.seen != null
      ? new Date(Date.now() - a.seen * 1000).toISOString()
      : null,
  };
}

// ---- Cache -----------------------------------------------------------------
let cache = { at: 0, payload: null };

async function fetchOverhead() {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_SECONDS * 1000) {
    return { ...cache.payload, cached: true };
  }

  const url = `http://${PIAWARE_HOST}:${PIAWARE_HTTP_PORT}/data/aircraft.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) {
    const err = new Error(`dump1090 HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();

  const flights = (data.aircraft || [])
    .map(normalize)
    .filter(Boolean);

  const payload = {
    home: { lat: HOME_LAT, lon: HOME_LON, label: HOME_LABEL },
    rangeNm: RANGE_NM,
    flights,
    updated: new Date().toISOString(),
    cached: false,
  };
  cache = { at: now, payload };
  return payload;
}

// ---- HTTP server -----------------------------------------------------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json" });
  res.end(body);
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath === "/api/config") {
    return sendJson(res, 200, {
      home: { lat: HOME_LAT, lon: HOME_LON, label: HOME_LABEL },
      rangeNm: RANGE_NM,
      live: true,
      cacheSeconds: CACHE_SECONDS,
    });
  }

  if (urlPath === "/api/overhead") {
    try {
      return sendJson(res, 200, await fetchOverhead());
    } catch (e) {
      console.error("PiAware fetch failed:", e.message);
      return sendJson(res, 503, { error: "piaware", message: e.message });
    }
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  Plane radar running:  http://localhost:${PORT}`);
  console.log(`  PiAware:  http://${PIAWARE_HOST}:${PIAWARE_HTTP_PORT}/data/aircraft.json`);
  console.log(`  Home:     ${HOME_LABEL}  ${HOME_LAT}, ${HOME_LON}`);
  console.log(`  Range:    ${RANGE_NM} nm   Cache: ${CACHE_SECONDS}s\n`);
});
