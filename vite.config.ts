import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // Reachable from Android emulator (10.0.2.2) and physical devices on LAN.
    host: true,
    proxy: {
      '/api': {
        // Prefer IPv4 loopback — `localhost` can hit ::1 on Windows and flake.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        timeout: 60_000,
        proxyTimeout: 60_000,
      },
    },
    // Capacitor native projects + build junk must not trigger HMR / full reloads
    // (and on Windows can destabilize the Vite process).
    watch: {
      ignored: [
        '**/android/**',
        '**/ios/**',
        '**/storage/**',
        '**/aws/lambdas/.build/**',
      ],
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
})

