# Tabi (旅)

Personal trip-planning web app. Built first for a trip to Japan in 2028 (Tokyo, Kyoto, Osaka), but designed for any destination.

Owner: Lydia Garcia (GitHub: `LydiaGarcia03`). She lives in Brazil and speaks Portuguese; **talk to her in Portuguese (pt-BR)**, but keep everything in the project in **English**: code, identifiers, file names, comments, commit messages, UI text, docs.

## Goal

Something like Wanderlog, plus precise route planning between places:

- Plan each day of a trip as an ordered list of places (pins) shown on a Google map.
- Attach notes to each place: historical context, tickets to have at hand, opening hours, tips.
- Between two consecutive places (A → B), define **exactly how to get there**, as a chain of segments with a transport mode each — e.g. "walk 400 m to X street, then bus line 7 from stop Y to B". Either draw it manually or ask the app for a suggested route.
- Track costs (places, transport, lodging, other) with totals per day and per trip.
- Use everything **offline** on the phone during the trip.
- Usable on her phone (installed as a PWA) and on her PC.

## Hard constraints

1. **Zero cost.** Lydia cannot pay for anything. Only free tiers, and every paid service must be capped so it can never charge. Do not add any dependency, service or API that could bill her.
2. **No scraping.** Never scrape or bulk-extract Google Maps data (violates Google's terms). Use official APIs or open data only.
3. **Static hosting only** (GitHub Pages). No backend server. All data lives on the device.
4. **No secrets in the repo.** The repo is public.
5. **English everywhere** in the project (see above).

## Key decisions and why

### Maps and places: Google Maps Platform
Google has the best place data (hotels, attractions, hours) for Japan. Used for **planning** (online).

- Google Cloud project: `japao-2028` (internal name only).
- One API key, restricted to:
  - HTTP referrer `https://lydiagarcia03.github.io/*`, plus `http://localhost:5177/*` for local dev (the console rejects port wildcards like `http://localhost:*/*`).
- **Local dev server port: 5177** (Lydia uses 5173 for another service). Set `server.port: 5177` and `strictPort: true` (and the same for `preview`) in `vite.config.ts`.
  - APIs: Maps JavaScript API, Places API (New), Routes API. Nothing else.
- Account is on the **Google Cloud free trial** (no charges possible; quota edits are locked during the trial). **Trial expires 2027-01-19.** A reminder is scheduled for 2027-01-12. Before it expires: upgrade to a paid account and immediately set daily quotas — Maps JavaScript API 300 map loads/day, Places API (New) 100/day, Routes API 100/day — plus a R$ 1 budget alert. After the trial, free usage is per SKU per month (Essentials 10,000, Pro 5,000, Enterprise 1,000 events); quotas must keep usage below that.
- Keep API usage lean: prefer Essentials-tier SKUs, request only the Places fields actually needed (field masks), store results locally so the same place/route is never fetched twice.
- Respect Google Maps Platform terms on caching: store `place_id` plus the user's own data; refresh Google-provided details when online. Do not cache map tiles for offline use.

### Transit routing: NAVITIME (decided in Phase 1)
- **Phase 1 result (2026-10-20):** Google's Routes API returns **no routes** for `TRANSIT` in Japan (Shinjuku Station → Senso-ji: empty `routes`, no fallback). NAVITIME returned 3 complete routes with lines, times, fares and track shapes. So NAVITIME is the transit engine; Google is used for maps, places and walking segments.
- NAVITIME Basic plan findings:
  - The `lang` parameter is rejected (`400 bad usage on this contract : Multilingual`), so station/line names come back in Japanese.
  - `shape=true` is allowed: the route geometry (GeoJSON) comes in the same `route_transit` response, so one route costs one request (no separate `shape_transit` call).
  - A `403 You are not subscribed to this API` with an active plan means the key belongs to a different RapidAPI app than the subscribed one.
  - JR fares spanning several JR lines are charged on the last JR segment; earlier JR segments show ¥0.
- **Japanese → English names:** NAVITIME names are Japanese, and machine translation mangles proper nouns (新宿 → "New Lodging"). So names are looked up in a dictionary of official English names of stations, lines and operators built from **Wikidata** (CC0): `scripts/update-japanese-names.mjs` (`npm run names:update`, run manually, output committed in `src/data/japanese-names.json`), used by `src/i18n/japaneseNames.ts`. Homonym stations (e.g. 神田 = Kanda in Tokyo, Kouda in Saga) are resolved by nearest coordinates. Unknown names stay in Japanese; the original Japanese is always shown next to the English (useful to match signs). Works offline, no API.
- **NAVITIME Route (totalnavi)** via RapidAPI — Japanese provider, door-to-door routes by public transport + walking, with fares. Endpoints: `route_transit`, `shape_transit` (polyline to draw on the map), `fare_table`, `fare_comparison`. Note: train times are NAVITIME's estimates, not real timetables — fine for advance planning.
- RapidAPI plan: **BASIC — $0/month, 500 requests/month with Hard Limit** (blocked, never billed, when exceeded), 50 requests/minute. Includes 10,240 MB/month of bandwidth (overage would be $0.001/MB, unreachable: 500 responses of tens of KB ≈ 25 MB). Never switch to Pro/Ultra (Ultra bills overage). Because the quota is small, always store fetched routes locally and never call NAVITIME automatically (only on an explicit user action).
- The RapidAPI website (marketplace/dashboard) is often down with 502/504 errors. That is not necessarily the API gateway itself, but treat the provider as unreliable: hide every route provider (Google, NAVITIME, future ones) behind one `RouteProvider` interface in its own module, handle errors and timeouts gracefully, and never block the user — manual segment entry must always work and saved routes must always be readable.
- RapidAPI host header: `X-RapidAPI-Host: navitime-route-totalnavi.p.rapidapi.com` (base URL `https://navitime-route-totalnavi.p.rapidapi.com`). Not a secret; can live in code.
- The RapidAPI key is **not** committed or baked into the build: the user enters it in the app's Settings and it is stored only on the device.
- Rejected: building our own router from open GTFS data (ODPT etc.) — coverage is patchy (JR and several private lines missing or restricted), too much work. Open data may still be used later just to draw lines/stations.
- Rejected: Ekispert API (free plan has no route search).
- Rejected: in-app AI route suggestions (would need a paid API). Lydia can ask Claude during development/planning instead.

### Offline: the app itself + Organic Maps
Google Maps (app or API) does not provide transit/walking directions offline, and can't import a custom multi-modal route.

- The PWA caches the app shell and keeps all trip data in IndexedDB, so itineraries, notes, segments and costs are readable offline.
- Export each trip/day to **KML** (and GPX) for **Organic Maps** (free, OpenStreetMap-based, excellent offline; imports KML/GPX with pins and tracks). OSM data is good in big Japanese cities; weaker on business info, which is why planning stays on Google.
- Each place and leg also has an "Open in Google Maps" deep link for when there is connectivity.
- KML export also works for Google My Maps if ever wanted.

### Hosting
- GitHub repo: `LydiaGarcia03/tabi` (public — required for free GitHub Pages).
- Deployed with **GitHub Actions** to GitHub Pages → `https://lydiagarcia03.github.io/tabi/` (Vite `base: '/tabi/'`).
- The Google key is provided to the build through a GitHub Actions secret (`VITE_GOOGLE_MAPS_API_KEY`). It ends up in the public bundle anyway — that is normal for Maps JS keys; the referrer + API restrictions are what protect it. Never commit it.

## Stack

- **Vite + React + TypeScript**
- **@vis.gl/react-google-maps** (Google-maintained React wrapper for the Maps JavaScript API)
- Routing through the Maps JavaScript API (routes library) so the referrer-restricted key works from the browser; NAVITIME via `fetch` to RapidAPI.
- **Dexie** (IndexedDB) for local storage.
- **vite-plugin-pwa** (Workbox) for installability and offline app shell.
- KML/GPX generated client-side (plain string builders, no heavy deps).
- Keep dependencies few and free/open source.

Platform support: latest Chrome on desktop and Android, Safari on iOS. Mobile-first layout.

## Data model (initial sketch)

- `Trip` — id, name, startDate, endDate, baseCurrency (JPY), displayCurrency (BRL), exchangeRate (manual).
- `Day` — id, tripId, date, title, ordered placeIds.
- `Place` — id, tripId, dayId, googlePlaceId?, googleFetchedAt?, name, lat, lng, address?, notes (markdown), plannedTime, cost?. Later: category, tickets/checklist.
- `Leg` — id, tripId, fromPlaceId, toPlaceId, ordered `Segment[]`, source (`manual` | `google` | `navitime`), fetchedAt, alternatives (last suggestions), alternativesDate.
- `Segment` — id, mode (`walk` | `bus` | `train` | `subway` | `taxi` | `ferry` | `other`), line/operator name, from/to stop names, from/to exits, times, path, distance, duration, fare, color, original (Japanese) names, notes.
- `Expense` — id, tripId, dayId? (absent = trip-wide), category (`lodging` | `transport` | `food` | `activities` | `shopping` | `other`), description, amount (Money), notes?.
- Backup: whole-trip JSON export/import (also the way to move data between PC and phone).

## Features and roadmap

- **Phase 0 — Setup** (done/ongoing): Google key, RapidAPI account, repo, Claude Code.
- **Phase 1 — Transit spike** (done): a minimal page that requests Shinjuku Station → Asakusa (Senso-ji) by public transit through Google and through NAVITIME and shows both results. Result: NAVITIME for transit (see above).
- **Phase 2 — Core planner** (done): trips, days, place search (Places API), pins on the map per day, reorder places, notes.
  - Data in IndexedDB via Dexie (`src/db/`); all writes go through `src/db/trips.ts`. Days are generated from the trip dates; changing dates never deletes a day that has places.
  - Hash routing (`#/trip/<id>/day/<id>`, `src/router.ts`), no router dependency; works on GitHub Pages and offline.
  - Places are added by Text Search (explicit Search button, never per keystroke), by tapping a Google POI on the map (details fetched only after "Add"), or as a free custom pin (no API call).
  - **TODO (Phase 5):** Google-provided coordinates/address may only be cached for 30 days; refresh places whose `googleFetchedAt` is older when online (the `place_id` itself can be kept forever).
- **Phase 3 — Legs** (done, including drawing manual segments on the map): segment editor between consecutive places (manual modes + suggested route), drawn on the map with a style per mode; walking segments routed via Google.
  - Any segment can be drawn by tapping points on the map ("Draw on map"). "Follow streets" snaps it with 1 Google Routes request: WALKING for walk, DRIVING for bus/taxi (at most 10 middle points, to stay on the Essentials SKU). Train/subway/ferry have no street geometry, so they stay as straight lines through the tapped points (free). Phase 5 export depends on segments having a path.
  - Legs are stored per (fromPlaceId, toPlaceId) pair (`src/db/legs.ts`), so they survive reordering; deleting a place deletes its legs.
  - "Suggest transit" = 1 NAVITIME request; all returned options are kept on the leg (`alternatives`), so switching option costs nothing. "Walking route" = 1 Google Routes request (whole leg A → B). A manual segment has no path until it is drawn; a leg with nothing drawable shows a thin dashed straight line.
  - NAVITIME `shapes` features come in route order tagged `ways: walk | transport`, color in `properties.inline.color`; they are matched to move sections in order (see `assignShapes`).
  - Suggestions for dates more than 60 days ahead are requested for the next same weekday (`suggestionDate`): providers only know current lines/schedules, and NAVITIME times are estimates anyway.
  - Station exits ("B4口") are shown as "Exit B4" (`translateExit`).
- **Phase 4 — Budget** (done): costs on places/segments/expenses, totals per day and trip, JPY ↔ BRL.
  - Every amount is a `Money` (amount + currency). Totals are kept per currency (`src/budget.ts`) and converted only for display: base-currency amounts × the trip's manual rate, display-currency amounts added as they are, other currencies shown apart (never guessed).
  - Day total = place costs (activities) + fares of the legs between its consecutive places (transport) + the day's expenses. Trip total = all days + trip-wide expenses (no `dayId`).
  - A day with expenses is never removed when trip dates change (like a day with places).
- **Phase 5 — Offline & export** (done): PWA install, offline reading, KML/GPX export for Organic Maps, Google Maps deep links, JSON backup/import.
  - `vite-plugin-pwa` (generateSW, `autoUpdate`) precaches the app's own files only (including the lazy Japanese names chunk); Google tiles/API responses are never cached. A new version is downloaded in the background and used on the next open. No service worker in `npm run dev`.
  - Icons are generated by `npm run icons` (`scripts/generate-icons.mjs`, plain Node PNG encoder, a torii on the app red); output committed in `public/`.
  - Offline: a banner says so; the day map is replaced by a message when it can't load, and wrapped in an `ErrorBoundary` (Google's code can throw when a map is unmounted offline). A map already shown is kept. Place search is hidden offline.
  - Exports (`src/export/`): `buildItinerary` turns days into points (name "D2 3. Place", description with time, address, cost, "how to get here" segment text with Japanese names and exits, notes) and lines (only segments with a path, in the segment color). KML for Organic Maps (colors are `aabbggrr`), GPX 1.1. Trip export on the trip page, day export on the day page.
  - Backup: JSON `{ format: 'tabi-trip', version: 1, trip, days, places, legs, expenses }` (`src/export/backup.ts`). Import on the trips page; if the trip id exists: Replace (overwrite) or Keep both (copy with all ids remapped).
  - Google places with `googleFetchedAt` older than 30 days are refreshed (address + location only, Essentials fields; never the user's name) when online and the trip or day page is open (`src/places/refresh.ts`).
  - "Open in Google Maps" for places and legs (`src/googleMapsLinks.ts`, Maps URLs, no API cost; travel mode picked from the segments).
  - Testing the PWA locally: `npx vite preview --port 5178` (a separate origin, so the service worker and test data never touch the dev server or the real data on 5177; the map shows a referrer error there, which is expected). Navigating to the same URL with only a different `#` does not reload the page: use a real reload.
- **Phase 6 — Polish:** UX on phone, dark mode, print/share a day.

## Working agreements

- Lydia is not a professional developer: explain steps simply (in Portuguese), give exact commands, and say which files changed and why.
- Before adding a dependency or calling a new paid-capable API, check it keeps the project at zero cost.
- Small, incremental commits with clear English messages.
- Run the dev server (`npm run dev`) and the build (`npm run build`) to verify changes before saying something works.
