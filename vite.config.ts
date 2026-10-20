import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served from https://lydiagarcia03.github.io/tabi/
  base: '/tabi/',
  // Port 5177 is the one allowed by the Google API key referrer restriction.
  server: { port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
  // The Japanese names dictionary (~660 kB) is a lazily loaded chunk; that's expected.
  build: { chunkSizeWarningLimit: 800 },
})
