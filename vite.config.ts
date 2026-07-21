import { defineConfig } from 'vite'
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
        target: 'http://localhost:3000',
        changeOrigin: true,
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
})
