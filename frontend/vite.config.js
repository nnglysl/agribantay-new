import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Point the dev proxy at whichever backend you're testing against.
// Local: http://127.0.0.1:8000  (needs `php artisan serve` running)
const API_TARGET = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
      '/sanctum': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      }
    }
  }
})