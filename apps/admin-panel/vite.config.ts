import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /api/* to control-plane in dev when VITE_ADMIN_API_BASE_URL is not set.
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
