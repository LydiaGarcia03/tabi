# Tabi 旅

**Plan every step of a trip.** Tabi is a personal trip planner that lets you organize each day on a map, define exactly how to get from one place to the next (walk, bus, train, subway, taxi…), keep notes and costs, and take everything offline.

> *Tabi* (旅) means "journey" in Japanese. The app was born to plan a trip to Japan in 2028, but it works for any destination.

🔗 **App:** https://lydiagarcia03.github.io/tabi/ *(coming soon)*

---

## Features

- **Day-by-day itinerary** — each day is an ordered list of places, shown as pins on a Google map.
- **Rich place notes** — historical context, tickets to have at hand, opening hours, tips.
- **Multi-modal routes between places** — build each leg from A to B as a chain of segments, each with its own mode of transport (e.g. *walk 400 m to the main street → bus line 7 to B*). Draw it yourself or ask for a suggested route.
- **Opening hours & best order** — type each place's opening hours and visit time; Tabi warns about visits that don't fit and suggests the best visiting order for the day (computed on the device, no API).
- **Budget** — costs for places, transport, lodging and extras, with totals per day and per trip (JPY ↔ BRL).
- **Offline-first** — installable as an app on the phone (PWA); the whole itinerary stays readable without internet.
- **Export to Organic Maps** — KML/GPX export with pins and routes for fully offline maps during the trip.
- **Open in Google Maps** — quick links for any place or leg when you are online.
- **Backup** — export/import a whole trip as a JSON file (also used to move data between PC and phone).

## How it works

| Moment | Tool | Why |
| --- | --- | --- |
| Planning (online) | Google Maps Platform | Best place data (attractions, hotels, hours) |
| Transit suggestions | NAVITIME | Google's Routes API returns no public-transit routes in Japan; NAVITIME is a Japanese routing provider |
| During the trip (offline) | Tabi (PWA) + Organic Maps | Google Maps can't show custom transit/walking routes offline |

All trip data lives on your device. There is no backend server.

## Tech stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/) — Maps JavaScript API, Places API (New), Routes API
- [NAVITIME Route (totalnavi)](https://rapidapi.com/navitimejapan-navitimejapan/api/navitime-route-totalnavi) via RapidAPI — public-transit routing
- [Dexie](https://dexie.org/) — local storage (IndexedDB)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — installable, offline-ready app
- GitHub Pages + GitHub Actions — hosting and deployment

## Getting started

### Requirements

- Node.js (LTS) and Git
- A Google Maps Platform API key (Maps JavaScript API, Places API (New), Routes API)
- *(Optional)* A RapidAPI key subscribed to NAVITIME Route (totalnavi), Basic plan

### Run locally

```bash
git clone https://github.com/LydiaGarcia03/tabi.git
cd tabi
npm install
```

Create a `.env.local` file in the project root (it is git-ignored — never commit it):

```bash
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key
```

Then start the dev server:

```bash
npm run dev
```

The app opens at `http://localhost:5177/tabi/`. For the map to load locally, the Google key must allow the `http://localhost:5177/*` referrer.

The RapidAPI key is not an environment variable: enter it in the app's **Settings** screen. It is stored only on your device.

### Build

```bash
npm run build
npm run preview
```

The production build installs a service worker (offline cache). To test it without affecting the dev server on port 5177, preview on another port: `npx vite preview --port 5178`.

### Using it during the trip

- **Install:** open the app on the phone and choose *Add to Home screen* (Android Chrome: menu ⋮ → *Install app*; iPhone Safari: Share → *Add to Home Screen*). Open it once while online; after that it works without internet.
- **Offline maps:** on the trip or day page, tap **Organic Maps (KML)** and open the file with [Organic Maps](https://organicmaps.app/) (download the Japan map in Organic Maps beforehand).
- **Phone ↔ PC:** **Backup (JSON)** on one device, **Import backup** on the other.

## Deployment

Every push to `main` builds and deploys the app to GitHub Pages through GitHub Actions.

The Google Maps key is passed to the build through the repository secret `VITE_GOOGLE_MAPS_API_KEY` (*Settings → Secrets and variables → Actions*). Maps JavaScript keys are always visible in the browser; the key is protected by its HTTP referrer and API restrictions in Google Cloud.

## Keeping it free

Tabi is designed to run at **zero cost**:

- **Google Maps Platform** — usage stays within the monthly free usage per API; the key is restricted to this site and to three APIs, and daily quotas cap usage.
- **NAVITIME via RapidAPI** — Basic plan: $0, 500 requests/month with a hard limit (requests are blocked, never billed). Routes are saved locally so they are never fetched twice.
- **Hosting** — GitHub Pages (free for public repositories).
- **Offline maps** — Organic Maps (free and open source).

## Roadmap

- [x] **Phase 1 — Transit spike:** compare Google and NAVITIME transit routes in Tokyo (NAVITIME wins)
- [x] **Phase 2 — Core planner:** trips, days, place search, pins, notes
- [x] **Phase 3 — Legs:** segment editor, suggested routes and hand-drawn segments on the map
- [x] **Phase 4 — Budget:** costs and totals, JPY ↔ BRL
- [x] **Phase 5 — Offline & export:** PWA, KML/GPX for Organic Maps, JSON backup
- [x] **Phase 6 — Polish:** redesign, mobile UX, dark mode, share and print a day
- [x] **Phase 7 — Opening hours & optimized order:** opening hours and visit time per place, best visiting order for a day

## Data and attribution

Map and place data © Google. Transit routes by NAVITIME JAPAN. English names of Japanese stations and lines from [Wikidata](https://www.wikidata.org/) (CC0). Offline maps by Organic Maps, using © OpenStreetMap contributors.

## About

A personal project by [Lydia Garcia](https://github.com/LydiaGarcia03), built with the help of [Claude](https://claude.ai).
