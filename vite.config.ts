import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The app's name and version live in app.config.json (bumped by `npm run version:patch|minor`).
const app = JSON.parse(readFileSync('app.config.json', 'utf8')) as AppConfig

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // index.html's %APP_NAME% (the tab's title).
    { name: 'app-config-html', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', app.name) },
    // Installable app + offline app shell. Trip data is in IndexedDB, so once
    // the shell is cached everything saved is readable without internet.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: `${app.name} ${app.nameJapanese}`,
        short_name: app.name,
        description: app.description,
        lang: 'en',
        // Stable identity of the installed app (Chrome uses it to match installs).
        id: '/tabi/',
        start_url: '/tabi/',
        scope: '/tabi/',
        display: 'standalone',
        // Android paints its navigation bar with this (the meta theme-color, which follows dark mode, only covers the top).
        // The color is fixed when the app is installed: it can't follow the app's theme (User keeps it light, 2026-10-30).
        // With `viewport-fit=cover` (index.html), Chrome on newer Androids with gesture navigation draws the page under that bar instead.
        theme_color: '#f6f1e9',
        background_color: '#f7f5f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app's own files only. Google map tiles and API responses are
        // never cached (Google Maps Platform terms).
        // The offline map's data lives in IndexedDB; its worker is the .mjs file.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png}'],
        // Hash routing: every page is index.html.
        navigateFallback: 'index.html',
      },
    }),
  ],
  // Served from https://lydiagarcia03.github.io/tabi/
  base: '/tabi/',
  // app.config.json, read by the app as __APP__ (name in the top bar, version at the end of Settings).
  define: { __APP__: JSON.stringify(app) },
  // Port 5177 is the one allowed by the Google API key referrer restriction.
  server: {
    port: 5177,
    strictPort: true,
    // `npm run dev` only: NAVITIME through this server, so the browser can read RapidAPI's monthly count
    // (x-ratelimit-requests-*, not exposed to other sites by CORS) for the API usage debug panel.
    proxy: {
      '/navitime-api': {
        target: 'https://navitime-route-totalnavi.p.rapidapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/navitime-api/, ''),
      },
    },
  },
  preview: { port: 5177, strictPort: true },
  // The Japanese names dictionary (~660 kB) is a lazily loaded chunk; that's expected.
  build: { chunkSizeWarningLimit: 800 },
})
